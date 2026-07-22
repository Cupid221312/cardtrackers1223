import type { ClipRating, LetterGrade, TranscriptSegment } from "@/lib/types";
import { emphasisMarkers, sentimentIntensity } from "@/services/ai/sentiment";

/**
 * Precision clip rating. Scores a clip on four independent axes the way
 * Opus/creator tools present them — Hook, Flow, Value, Trend — from the
 * transcript text/timing plus (optionally) the decoded audio energy of the
 * window. Pure, deterministic, and fully offline (zero API credits).
 *
 * The virality formula (all sub-scores normalized to 0..100):
 *   hook  = f(opening-3s pattern hits, opening question, opening emotional
 *             intensity, audio energy at the start)   — the scroll-stopper
 *   value = f(payoff/number/framework patterns, emotional intensity)
 *   trend = f(format/hype patterns, emotional intensity, emphasis markers,
 *             audio energy)
 *   flow  = f(pacing consistency across segments, length sweet spot ~38s)
 *   overall = 0.34·hook + 0.26·value + 0.22·trend + 0.18·flow
 * Audio energy lets hype moments in streams (cheers, laughs, no keyword
 * hook) still surface — text-only scoring would miss them.
 */

const AXIS_WEIGHTS = { hook: 0.34, value: 0.26, trend: 0.22, flow: 0.18 };

const HOOK_PATTERNS: RegExp[] = [
  /\b(secret|nobody tells you|no one talks about)\b/i,
  /\b(biggest|worst|best|#1|number one)\b/i,
  /\bhere'?s (why|how|what|the thing)\b/i,
  /\b(stop|never|always)\b/i,
  /\?\s*$/,
  /\b(most people|everyone thinks|you('ve| have) been told)\b/i,
];

const VALUE_PATTERNS: RegExp[] = [
  /\$?\d[\d,.]*\s?(dollars|k|million|billion|percent|%|x)\b/i,
  /\b(step one|first thing|three things|the framework|the formula|the trick)\b/i,
  /\b(i (lost|made|spent|learned|realized)|we (built|grew|failed))\b/i,
  /\b(because|the reason|which means|so that)\b/i,
];

const TREND_PATTERNS: RegExp[] = [
  /\b(crazy|insane|unbelievable|shocking|wild|blew my mind|obsessed)\b/i,
  /\b(pov|storytime|hot take|unpopular opinion|controversial)\b/i,
  /\b(ai|viral|algorithm|content|creator|reels?|shorts?|tiktok)\b/i,
];

function scoreAxis(text: string, patterns: RegExp[], base: number): number {
  let hits = 0;
  for (const re of patterns) if (re.test(text)) hits++;
  // Diminishing returns: each hit adds less than the last.
  const bonus = (1 - Math.pow(0.6, hits)) * (100 - base);
  return Math.round(base + bonus);
}

export interface RateOptions {
  /**
   * Peak audio energy within the clip window, 0..1 (from the decoded
   * waveform). Optional — when absent the score is text-only.
   */
  audioEnergy?: number;
}

export function rateClip(
  segments: TranscriptSegment[],
  start: number,
  end: number,
  opts: RateOptions = {},
): ClipRating {
  const inClip = segments.filter((s) => s.end > start && s.start < end);
  const text = inClip.map((s) => s.text).join(" ");
  // "Opening" = whatever is spoken in the first ~3.5s — the scroll-stopper
  // window that decides if a viewer stays.
  const opening = inClip
    .filter((s) => s.start < start + 3.5)
    .map((s) => s.text)
    .join(" ") || (inClip[0]?.text ?? "");
  const dur = Math.max(end - start, 1);
  const energy = clamp01(opts.audioEnergy ?? 0);

  // --- Hook: opening patterns + opening question + opening emotion + a loud
  //     start (energy). This is weighted toward the first seconds on purpose.
  const hook = clampScore(
    scoreAxis(opening, HOOK_PATTERNS, 42) +
      (/\?/.test(opening) ? 6 : 0) +
      sentimentIntensity(opening) * 18 +
      energy * 10,
  );

  // --- Value: payoff/number/framework patterns + emotional substance.
  const value = clampScore(
    scoreAxis(text, VALUE_PATTERNS, 46) + sentimentIntensity(text) * 12,
  );

  // --- Trend: format/hype patterns + emotional intensity + emphasis + energy.
  const trend = clampScore(
    scoreAxis(text, TREND_PATTERNS, 42) +
      sentimentIntensity(text) * 22 +
      Math.min(8, emphasisMarkers(text) * 3) +
      energy * 12,
  );

  // --- Flow: pacing *consistency* across segments (jittery delivery reads as
  //     choppy) plus a length sweet spot around ~38s.
  const rates = inClip.map(
    (s) => s.wordIds.length / Math.max(s.end - s.start, 0.3),
  );
  const mean = rates.reduce((a, b) => a + b, 0) / Math.max(rates.length, 1);
  const variance =
    rates.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(rates.length, 1);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coeff. of variation
  const consistency = 100 - Math.min(60, cv * 80);
  const lengthScore = 100 - Math.min(50, Math.abs(dur - 38) * 1.4);
  const flow = Math.round(Math.max(40, consistency * 0.5 + lengthScore * 0.5));

  return { hook, flow, value, trend };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clampScore(v: number): number {
  return Math.max(0, Math.min(99, Math.round(v)));
}

export function overallScore(rating: ClipRating): number {
  const s =
    rating.hook * AXIS_WEIGHTS.hook +
    rating.value * AXIS_WEIGHTS.value +
    rating.trend * AXIS_WEIGHTS.trend +
    rating.flow * AXIS_WEIGHTS.flow;
  return Math.min(99, Math.round(s));
}

/** Map a 0..100 axis/overall value to a letter grade. */
export function toGrade(value: number): LetterGrade {
  if (value >= 95) return "A+";
  if (value >= 88) return "A";
  if (value >= 82) return "A-";
  if (value >= 76) return "B+";
  if (value >= 70) return "B";
  if (value >= 63) return "B-";
  if (value >= 56) return "C+";
  if (value >= 48) return "C";
  return "D";
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "for",
  "with", "is", "are", "was", "were", "it", "this", "that", "you", "your",
  "i", "we", "they", "he", "she", "my", "me", "at", "as", "be", "have",
  "has", "do", "does", "did", "just", "like", "about", "if", "then", "not",
  "what", "how", "why", "when", "into", "from", "one", "get", "got",
]);

/** Pull frequent content words as keyword tags for search/filtering. */
export function extractKeywords(text: string, max = 6): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/** Terse scene-analysis paragraph from the clip's transcript. */
export function sceneAnalysis(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): string {
  const inClip = segments.filter((s) => s.end > start && s.start < end);
  const text = inClip.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  const mmss = (t: number) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const excerpt = text.length > 320 ? `${text.slice(0, 320).replace(/\s\S*$/, "")}…` : text;
  return `[${mmss(start)}–${mmss(end)}] ${excerpt}`;
}
