import type {
  ClipCandidate,
  ClipFinderSettings,
  Transcript,
  TranscriptSegment,
} from "@/lib/types";
import {
  extractKeywords,
  overallScore,
  rateClip,
  sceneAnalysis,
} from "@/services/ai/rating";

/**
 * Heuristic viral-moment detector. Scores every transcript segment on
 * conversational hooks, sentiment intensity, topic-change signals, and
 * (optionally) audio energy, then grows the best seeds into windows aligned
 * to segment boundaries. Pure and deterministic so it runs identically on
 * client and server; the /api/clips/detect route can optionally re-rank and
 * re-title the winners with an LLM when OPENAI_API_KEY is present.
 *
 * Audio energy is optional: when the decoded waveform is available, loud
 * moments (cheers, laughs, hype) boost seed scores so exciting stream/gaming
 * clips surface even when the words alone aren't "hooky".
 */

export interface ClipFinderInputs {
  /** Decoded waveform amplitude buckets, evenly spaced across the source. */
  peaks?: number[];
  /** Total seconds the peaks span (source duration). */
  peaksDuration?: number;
}

/** Max normalized (0..1) audio energy in a [start,end) window. */
function windowEnergy(
  start: number,
  end: number,
  peaks: number[] | undefined,
  totalDur: number | undefined,
  peakMax: number,
): number {
  if (!peaks || peaks.length === 0 || !totalDur || totalDur <= 0 || peakMax <= 0) {
    return 0;
  }
  const per = totalDur / peaks.length;
  const from = Math.max(0, Math.floor(start / per));
  const to = Math.min(peaks.length - 1, Math.ceil(end / per));
  let m = 0;
  for (let i = from; i <= to; i++) m = Math.max(m, peaks[i]);
  return Math.max(0, Math.min(1, m / peakMax));
}

const HOOK_PATTERNS: Array<{ re: RegExp; weight: number; label: string }> = [
  { re: /\b(secret|nobody tells you|no one talks about)\b/i, weight: 22, label: "curiosity hook" },
  { re: /\b(biggest|worst|best|#1|number one) (mistake|thing|reason|way)\b/i, weight: 24, label: "superlative hook" },
  { re: /\bhere'?s (why|how|what|the thing)\b/i, weight: 18, label: "explainer hook" },
  { re: /\b(stop|never|always) (doing|do|say|use)\b/i, weight: 16, label: "imperative hook" },
  { re: /\b(i (lost|made|spent|learned)|we (built|grew|failed))\b/i, weight: 15, label: "personal story" },
  { re: /\b\$?\d[\d,.]*\s?(dollars|k|million|billion|percent|%|x)\b/i, weight: 14, label: "concrete number" },
  { re: /\?\s*$/, weight: 10, label: "question" },
  { re: /\b(crazy|insane|unbelievable|shocking|wild|blew my mind)\b/i, weight: 12, label: "sentiment peak" },
  { re: /\b(truth is|honestly|let me be real|controversial)\b/i, weight: 12, label: "candor signal" },
  { re: /\b(step one|first thing|three things|the framework|the formula)\b/i, weight: 13, label: "list/framework" },
  { re: /\b(most people|everyone thinks|you('ve| have) been told)\b/i, weight: 14, label: "contrarian setup" },
];

interface ScoredSegment {
  segment: TranscriptSegment;
  score: number;
  labels: string[];
}

function scoreSegment(
  segment: TranscriptSegment,
  prev: TranscriptSegment | null,
): ScoredSegment {
  let score = 0;
  const labels: string[] = [];
  for (const { re, weight, label } of HOOK_PATTERNS) {
    if (re.test(segment.text)) {
      score += weight;
      labels.push(label);
    }
  }
  // A pause before the segment suggests a topic change / new beat.
  if (prev && segment.start - prev.end > 1.2) {
    score += 8;
    labels.push("topic change");
  }
  // Mild preference for dense speech (more words per second reads as energy).
  const dur = Math.max(segment.end - segment.start, 0.5);
  const density = segment.wordIds.length / dur;
  if (density > 2.5) score += 5;
  return { segment, score, labels };
}

function windowFromSeed(
  scored: ScoredSegment[],
  seedIndex: number,
  settings: ClipFinderSettings,
): { start: number; end: number; score: number; labels: string[] } {
  const seed = scored[seedIndex];
  let start = seed.segment.start;
  let end = seed.segment.end;
  let total = seed.score;
  const labels = [...seed.labels];
  let left = seedIndex - 1;
  let right = seedIndex + 1;

  // Greedily grow toward the higher-scoring neighbor until we hit maxDuration.
  while (end - start < settings.maxDuration) {
    const l = left >= 0 ? scored[left] : null;
    const r = right < scored.length ? scored[right] : null;
    if (!l && !r) break;
    const takeLeft =
      l !== null && (r === null || l.score >= r.score) &&
      end - l.segment.start <= settings.maxDuration;
    const takeRight =
      r !== null && r.segment.end - start <= settings.maxDuration;
    if (takeLeft && l) {
      start = l.segment.start;
      total += l.score;
      labels.push(...l.labels);
      left--;
    } else if (takeRight && r) {
      end = r.segment.end;
      total += r.score;
      labels.push(...r.labels);
      right++;
    } else {
      break;
    }
    if (end - start >= settings.minDuration && (!l || l.score === 0) && (!r || r.score === 0)) {
      break;
    }
  }
  return { start, end, score: total, labels };
}

function makeTitle(segment: TranscriptSegment): string {
  const text = segment.text.trim().replace(/\s+/g, " ");
  const cut = text.length > 42 ? `${text.slice(0, 42).replace(/\s\S*$/, "")}…` : text;
  return cut.toUpperCase();
}

export function findClips(
  transcript: Transcript,
  settings: ClipFinderSettings,
  inputs: ClipFinderInputs = {},
): ClipCandidate[] {
  const { segments } = transcript;
  if (segments.length === 0) return [];

  const peaks = inputs.peaks;
  const peaksDuration = inputs.peaksDuration;
  const peakMax = peaks && peaks.length ? Math.max(...peaks) : 0;

  const scored = segments.map((seg, i) => {
    const s = scoreSegment(seg, i > 0 ? segments[i - 1] : null);
    // Loud moments boost the seed even without a textual hook.
    const energy = windowEnergy(seg.start, seg.end, peaks, peaksDuration, peakMax);
    if (energy > 0.55) {
      s.score += Math.round(energy * 16);
      s.labels.push("audio peak");
    }
    return s;
  });

  const seeds = scored
    .map((s, i) => ({ ...s, index: i }))
    .sort((a, b) => b.score - a.score);

  const clips: ClipCandidate[] = [];
  const used: Array<[number, number]> = [];

  for (const seed of seeds) {
    if (clips.length >= settings.maxClips) break;
    const win = windowFromSeed(scored, seed.index, settings);
    if (win.end - win.start < settings.minDuration) {
      // Short tail-end seed: pad forward, clamped to the source.
      win.end = Math.min(
        win.start + settings.minDuration,
        segments[segments.length - 1].end,
      );
      if (win.end - win.start < settings.minDuration * 0.6) continue;
    }
    const overlaps = used.some(
      ([s, e]) => win.start < e - 2 && win.end > s + 2,
    );
    if (overlaps) continue;
    used.push([win.start, win.end]);

    const uniqueLabels = [...new Set(win.labels)];
    const clipEnergy = windowEnergy(
      win.start,
      win.end,
      peaks,
      peaksDuration,
      peakMax,
    );
    const rating = rateClip(segments, win.start, win.end, {
      audioEnergy: clipEnergy,
    });
    const clipText = segments
      .filter((s) => s.end > win.start && s.start < win.end)
      .map((s) => s.text)
      .join(" ");
    clips.push({
      id: `clip-${clips.length}-${Math.round(win.start * 10)}`,
      title: makeTitle(seed.segment),
      start: win.start,
      end: win.end,
      score: overallScore(rating),
      rating,
      reason:
        uniqueLabels.length > 0
          ? `Detected: ${uniqueLabels.slice(0, 4).join(", ")}`
          : "Continuous high-energy speech",
      sceneAnalysis: sceneAnalysis(segments, win.start, win.end),
      keywords: extractKeywords(clipText),
    });
  }

  return clips.sort((a, b) => b.score - a.score);
}
