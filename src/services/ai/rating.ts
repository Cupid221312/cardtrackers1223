import type { ClipRating, LetterGrade, TranscriptSegment } from "@/lib/types";

/**
 * Precision clip rating. Scores a clip on four independent axes the way
 * Opus/creator tools present them — Hook, Flow, Value, Trend — from the
 * transcript text and timing of the segments inside the clip window. Pure
 * and deterministic; the same signals the heuristic clip finder collects
 * are reused so the rating and the selection agree.
 */

const AXIS_WEIGHTS = { hook: 0.34, value: 0.28, trend: 0.2, flow: 0.18 };

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

export function rateClip(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): ClipRating {
  const inClip = segments.filter((s) => s.end > start && s.start < end);
  const text = inClip.map((s) => s.text).join(" ");
  const opening = inClip.slice(0, 2).map((s) => s.text).join(" ");
  const dur = Math.max(end - start, 1);

  // Hook leans on the opening lines specifically.
  const hook = Math.min(
    99,
    scoreAxis(opening, HOOK_PATTERNS, 45) + (/\?/.test(opening) ? 6 : 0),
  );

  const value = Math.min(99, scoreAxis(text, VALUE_PATTERNS, 48));
  const trend = Math.min(99, scoreAxis(text, TREND_PATTERNS, 44));

  // Flow rewards steady speech density and a clip length in the sweet spot
  // (~30–50s), penalizing very long or choppy windows.
  const wordCount = inClip.reduce((n, s) => n + s.wordIds.length, 0);
  const density = wordCount / dur; // words/sec
  const densityScore = 100 - Math.min(60, Math.abs(density - 2.6) * 22);
  const lengthScore = 100 - Math.min(50, Math.abs(dur - 40) * 1.4);
  const flow = Math.round(Math.max(40, densityScore * 0.55 + lengthScore * 0.45));

  return { hook, flow, value, trend };
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
