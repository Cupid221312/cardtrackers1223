import { describe, expect, it } from "vitest";
import {
  findClipsFromSignals,
  normalizeSettings,
} from "@/services/ai/signalClipFinder";
import { findClips } from "@/services/ai/clipFinder";
import type { ClipFinderSettings, Transcript } from "@/lib/types";

const settings: ClipFinderSettings = {
  minDuration: 15,
  maxDuration: 45,
  maxClips: 5,
};

/**
 * 600s of quiet audio with deliberate loud bursts. `peaks` are evenly spaced
 * amplitude buckets, matching what /api/media/[id]/waveform returns.
 */
function peaksWithBurstsAt(seconds: number[], duration = 600, buckets = 600) {
  const peaks = new Array(buckets).fill(0.1);
  const perBucket = duration / buckets;
  for (const s of seconds) {
    const i = Math.floor(s / perBucket);
    for (let k = i; k < Math.min(buckets, i + 12); k++) peaks[k] = 0.95;
  }
  return peaks;
}

describe("findClipsFromSignals", () => {
  it("finds highlights from audio alone, with no transcript", () => {
    const clips = findClipsFromSignals(
      {
        duration: 600,
        peaks: peaksWithBurstsAt([120, 300, 480]),
        peaksDuration: 600,
      },
      settings,
    );
    expect(clips.length).toBeGreaterThan(0);
    // The loudest moments should be covered by the top-ranked clips.
    const covered = (t: number) =>
      clips.some((c) => c.start <= t + 30 && c.end >= t);
    expect(covered(120)).toBe(true);
    expect(covered(300)).toBe(true);
  });

  it("attaches an explanation and signal breakdown to every clip", () => {
    const clips = findClipsFromSignals(
      { duration: 600, peaks: peaksWithBurstsAt([200]), peaksDuration: 600 },
      settings,
    );
    for (const c of clips) {
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.signals?.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });

  it("respects duration bounds and the clip cap", () => {
    const clips = findClipsFromSignals(
      { duration: 600, peaks: peaksWithBurstsAt([60, 180, 300, 420, 540]), peaksDuration: 600 },
      { ...settings, maxClips: 3 },
    );
    expect(clips.length).toBeLessThanOrEqual(3);
    for (const c of clips) {
      expect(c.end - c.start).toBeLessThanOrEqual(settings.maxDuration + 0.01);
      expect(c.end).toBeLessThanOrEqual(600.01);
      expect(c.start).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns non-overlapping clips", () => {
    const clips = findClipsFromSignals(
      { duration: 600, peaks: peaksWithBurstsAt([100, 140, 300]), peaksDuration: 600 },
      settings,
    );
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end - 1.01);
    }
  });

  it("works from scene cuts when there is no audio at all", () => {
    const cuts = [50, 52, 54, 56, 58, 300, 500];
    const clips = findClipsFromSignals({ duration: 600, cuts }, settings);
    expect(clips.length).toBeGreaterThan(0);
    // The dense burst of cuts around 50s should rank first.
    expect(clips[0].start).toBeLessThanOrEqual(60);
  });

  it("returns nothing when no signals are available", () => {
    expect(findClipsFromSignals({ duration: 600 }, settings)).toEqual([]);
    expect(findClipsFromSignals({ duration: 0, peaks: [1, 2, 3] }, settings)).toEqual([]);
  });
});

describe("normalizeSettings", () => {
  it("repairs a range saved backwards instead of returning no clips", () => {
    // Exactly the state a user can persist by typing Min before Max.
    const broken = { minDuration: 30, maxDuration: 6, maxClips: 9 };
    expect(normalizeSettings(broken)).toEqual({
      minDuration: 6,
      maxDuration: 30,
      maxClips: 9,
    });
    const clips = findClipsFromSignals(
      { duration: 600, peaks: peaksWithBurstsAt([120, 400]), peaksDuration: 600 },
      broken,
    );
    expect(clips.length).toBeGreaterThan(0);
  });

  it("leaves a valid range untouched", () => {
    expect(normalizeSettings(settings)).toEqual(settings);
  });

  it("keeps min and max from collapsing onto each other", () => {
    const r = normalizeSettings({ minDuration: 20, maxDuration: 20, maxClips: 3 });
    expect(r.maxDuration).toBeGreaterThan(r.minDuration);
  });
});

describe("findClips routing", () => {
  const demo: Transcript = {
    source: "mock",
    language: "en",
    words: [{ id: "w0", text: "hello", start: 0, end: 1 }],
    segments: [
      { id: "s0", text: "hello there", start: 0, end: 5, wordIds: ["w0"] },
    ],
  };

  it("ignores a placeholder transcript and uses audio signals instead", () => {
    const clips = findClips(demo, settings, {
      duration: 600,
      peaks: peaksWithBurstsAt([120, 400]),
      peaksDuration: 600,
    });
    expect(clips.length).toBeGreaterThan(0);
    // A demo transcript only spans 5s; signal clips span the real video.
    expect(clips.some((c) => c.start > 60)).toBe(true);
  });

  it("still produces clips when the transcript is null", () => {
    const clips = findClips(null, settings, {
      duration: 600,
      peaks: peaksWithBurstsAt([120]),
      peaksDuration: 600,
    });
    expect(clips.length).toBeGreaterThan(0);
  });
});
