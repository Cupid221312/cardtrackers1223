import type {
  ClipCandidate,
  ClipFinderSettings,
  ClipSignal,
} from "@/lib/types";
import { overallScore, toGrade } from "@/services/ai/rating";

/**
 * Transcript-free viral-moment detection (roadmap §4, signal families B + C).
 *
 * Transcript-only scoring is what every other clipper does, and it falls apart
 * on gaming/IRL streams where the best moments are a scream, a clutch play, or
 * a burst of cuts — not a quotable sentence. This engine slides a window across
 * the source, measures each signal, normalizes it to a **z-score over this
 * specific video** (so a hype streamer and a calm one are both scored fairly),
 * and fuses the result into a 0–100 score with an explanation attached.
 *
 * Everything here is pure and deterministic so it runs identically on the
 * client and the server.
 */

export interface SignalInputs {
  /** Source duration in seconds. */
  duration: number;
  /** Decoded waveform amplitude buckets, evenly spaced across the source. */
  peaks?: number[];
  /** Seconds the peaks span (defaults to `duration`). */
  peaksDuration?: number;
  /** Absolute scene-cut timestamps in seconds. */
  cuts?: number[];
}

interface Window {
  start: number;
  end: number;
  /** Loudest moment in the window, 0..1. */
  energyPeak: number;
  /** Average loudness across the window, 0..1. */
  energyMean: number;
  /** How much louder the second half is than the first (a build/drop). */
  energyRamp: number;
  /** Scene cuts per second. */
  cutRate: number;
}

/** Mean and standard deviation, guarding the degenerate all-equal case. */
function stats(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return { mean, sd: Math.sqrt(variance) || 1 };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Slice of the peaks array covering [start,end). */
function peakSlice(
  start: number,
  end: number,
  peaks: number[],
  totalDur: number,
): number[] {
  const per = totalDur / peaks.length;
  const from = Math.max(0, Math.floor(start / per));
  const to = Math.min(peaks.length, Math.ceil(end / per));
  return peaks.slice(from, Math.max(from + 1, to));
}

function buildWindows(
  inputs: SignalInputs,
  windowLen: number,
  hop: number,
): Window[] {
  const { duration } = inputs;
  const peaks = inputs.peaks ?? [];
  const peaksDur = inputs.peaksDuration ?? duration;
  const peakMax = peaks.length ? Math.max(...peaks) : 0;
  const cuts = inputs.cuts ?? [];

  const windows: Window[] = [];
  for (let start = 0; start + windowLen <= duration + hop; start += hop) {
    const end = Math.min(start + windowLen, duration);
    if (end - start < windowLen * 0.5) break;

    let energyPeak = 0;
    let energyMean = 0;
    let energyRamp = 0;
    if (peaks.length && peakMax > 0) {
      const slice = peakSlice(start, end, peaks, peaksDur);
      energyPeak = clamp01(Math.max(...slice) / peakMax);
      energyMean =
        clamp01(slice.reduce((a, b) => a + b, 0) / slice.length / peakMax);
      const mid = Math.floor(slice.length / 2);
      const firstHalf = slice.slice(0, mid);
      const secondHalf = slice.slice(mid);
      const avg = (xs: number[]) =>
        xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      // A quiet beat followed by a burst is the classic "moment" shape.
      energyRamp = clamp01((avg(secondHalf) - avg(firstHalf)) / peakMax + 0.5);
    }

    const inWindow = cuts.filter((c) => c >= start && c < end).length;
    const cutRate = inWindow / Math.max(1, end - start);

    windows.push({ start, end, energyPeak, energyMean, energyRamp, cutRate });
  }
  return windows;
}

/** Convert a z-score to a 0..100 strength for display. */
function zToStrength(z: number): number {
  return Math.round(clamp01((z + 2) / 4) * 100);
}

function describeMultiple(value: number, mean: number): string {
  if (mean <= 0.0001) return "above a silent baseline";
  const x = value / mean;
  return `${x.toFixed(1)}x this video's average`;
}

/**
 * Rank windows by fused signal strength and return the best non-overlapping
 * candidates, each carrying the breakdown that produced its score.
 */
export function findClipsFromSignals(
  inputs: SignalInputs,
  settings: ClipFinderSettings,
): ClipCandidate[] {
  const { duration } = inputs;
  if (!duration || duration <= 0) return [];

  const hasAudio = Boolean(inputs.peaks && inputs.peaks.length > 4);
  const hasCuts = Boolean(inputs.cuts && inputs.cuts.length > 0);
  if (!hasAudio && !hasCuts) return [];

  // Roadmap §4: variable window length, ~1/3 overlap between windows.
  const windowLen = Math.min(
    Math.max(settings.minDuration, (settings.minDuration + settings.maxDuration) / 2),
    Math.max(settings.minDuration, duration),
  );
  const hop = Math.max(3, windowLen / 3);
  const windows = buildWindows(inputs, windowLen, hop);
  if (windows.length === 0) return [];

  // Per-video z-score normalization, so scoring adapts to this creator.
  const peakStats = stats(windows.map((w) => w.energyPeak));
  const meanStats = stats(windows.map((w) => w.energyMean));
  const rampStats = stats(windows.map((w) => w.energyRamp));
  const cutStats = stats(windows.map((w) => w.cutRate));

  const scored = windows.map((w) => {
    const zPeak = (w.energyPeak - peakStats.mean) / peakStats.sd;
    const zMean = (w.energyMean - meanStats.mean) / meanStats.sd;
    const zRamp = (w.energyRamp - rampStats.mean) / rampStats.sd;
    const zCut = (w.cutRate - cutStats.mean) / cutStats.sd;

    // Hand-tuned fusion weights. Peak loudness is the strongest single
    // predictor of a highlight on stream footage; cut density is a good
    // secondary for action, and the ramp catches build-ups.
    const fused = hasAudio
      ? 0.45 * zPeak + 0.2 * zMean + 0.15 * zRamp + (hasCuts ? 0.2 * zCut : 0)
      : zCut;

    const signals: ClipSignal[] = [];
    if (hasAudio) {
      signals.push({
        family: "acoustic",
        label: "Audio energy",
        strength: zToStrength(zPeak),
        detail: `Peak loudness ${describeMultiple(w.energyPeak, peakStats.mean)}`,
      });
      if (zRamp > 0.5) {
        signals.push({
          family: "acoustic",
          label: "Build-up",
          strength: zToStrength(zRamp),
          detail: "Quiet beat then a burst — classic highlight shape",
        });
      }
    }
    if (hasCuts) {
      signals.push({
        family: "visual",
        label: "Scene cuts",
        strength: zToStrength(zCut),
        detail: `${(w.cutRate * 60).toFixed(1)} cuts/min ${
          zCut > 0 ? "above" : "below"
        } average`,
      });
    }

    return { window: w, fused, zPeak, zRamp, zCut, signals };
  });

  const ranked = [...scored].sort((a, b) => b.fused - a.fused);
  const clips: ClipCandidate[] = [];
  const used: Array<[number, number]> = [];

  for (const cand of ranked) {
    if (clips.length >= settings.maxClips) break;
    const { window: w } = cand;
    if (used.some(([s, e]) => w.start < e - 1 && w.end > s + 1)) continue;
    used.push([w.start, w.end]);

    // Map the fused z-score onto a friendly 0..100 band. A z of +2 (a genuine
    // standout for this video) lands near 95; the median window lands near 55.
    const score = Math.round(clamp01((cand.fused + 1.6) / 3.6) * 100);
    const rating = {
      hook: Math.round(clamp01((cand.zRamp + 1.5) / 3) * 100),
      flow: Math.round(clamp01(0.55 + w.energyMean * 0.4) * 100),
      value: Math.round(clamp01((cand.zPeak + 1.5) / 3) * 100),
      trend: Math.round(clamp01((cand.zCut + 1.5) / 3) * 100),
    };

    const top = [...cand.signals].sort((a, b) => b.strength - a.strength)[0];
    const mins = Math.floor(w.start / 60);
    const secs = Math.round(w.start % 60).toString().padStart(2, "0");

    clips.push({
      id: `sig-${clips.length}-${Math.round(w.start * 10)}`,
      title: `HIGH ENERGY @ ${mins}:${secs}`,
      start: w.start,
      end: w.end,
      score: Math.max(score, overallScore(rating) - 10),
      rating,
      reason: top
        ? `${top.label}: ${top.detail}`
        : "Sustained activity above this video's baseline",
      sceneAnalysis:
        `Detected from audio and motion signals (no speech required). ` +
        `Overall grade ${toGrade(score)}. ` +
        cand.signals.map((s) => `${s.label} ${s.strength}/100`).join(" · "),
      keywords: cand.signals.map((s) => s.label.toLowerCase()),
      signals: cand.signals,
    });
  }

  return clips.sort((a, b) => b.score - a.score);
}
