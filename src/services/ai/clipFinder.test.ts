import { describe, expect, it } from "vitest";
import { findClips } from "@/services/ai/clipFinder";
import type { Transcript, TranscriptSegment, Word } from "@/lib/types";

function makeTranscript(sentences: string[], secondsEach = 8): Transcript {
  const words: Word[] = [];
  const segments: TranscriptSegment[] = [];
  let t = 0;
  sentences.forEach((sentence, si) => {
    const tokens = sentence.split(" ");
    const per = secondsEach / tokens.length;
    const ids: string[] = [];
    const start = t;
    for (const token of tokens) {
      const id = `w-${words.length}`;
      words.push({ id, text: token, start: t, end: t + per * 0.8 });
      ids.push(id);
      t += per;
    }
    segments.push({
      id: `seg-${si}`,
      text: sentence,
      start,
      end: t,
      wordIds: ids,
    });
  });
  return { words, segments, language: "en", source: "mock" };
}

const HOOKY = [
  "Here's why most people fail at this.",
  "The biggest mistake I made cost me 50000 dollars.",
  "Everyone thinks talent matters most but that is wrong.",
  "Filler sentence with nothing interesting at all in it.",
  "Another plain sentence that just keeps talking along.",
  "Stop doing the easy work first every single day.",
  "More filler words to pad the transcript out here.",
  "Even more padding so windows can grow properly okay.",
  "What would this look like if it were easy?",
  "Final thought that wraps everything up nicely today.",
];

describe("findClips", () => {
  it("returns clips within the requested duration bounds", () => {
    const clips = findClips(makeTranscript(HOOKY), {
      minDuration: 20,
      maxDuration: 40,
      maxClips: 3,
    });
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(clip.end - clip.start).toBeGreaterThanOrEqual(12);
      expect(clip.end - clip.start).toBeLessThanOrEqual(40.01);
      expect(clip.score).toBeGreaterThan(0);
      expect(clip.title.length).toBeGreaterThan(0);
      // Rating axes are populated and in range.
      for (const axis of [clip.rating.hook, clip.rating.flow, clip.rating.value, clip.rating.trend]) {
        expect(axis).toBeGreaterThanOrEqual(0);
        expect(axis).toBeLessThanOrEqual(99);
      }
      expect(clip.sceneAnalysis.length).toBeGreaterThan(0);
    }
  });

  it("ranks clips by score, highest first", () => {
    const clips = findClips(makeTranscript(HOOKY), {
      minDuration: 15,
      maxDuration: 30,
      maxClips: 5,
    });
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i].score).toBeLessThanOrEqual(clips[i - 1].score);
    }
  });

  it("does not return overlapping clips", () => {
    const clips = findClips(makeTranscript(HOOKY), {
      minDuration: 15,
      maxDuration: 30,
      maxClips: 5,
    });
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end - 2.01);
    }
  });

  it("surfaces a loud, textually-plain moment when audio energy is supplied", () => {
    // All-filler transcript: no textual hooks anywhere.
    const flat = [
      "just a plain sentence about nothing much at all here",
      "another equally plain sentence that keeps talking along",
      "yet more ordinary words with no hook or excitement present",
      "a fourth ordinary line continuing the calm narration here",
      "and a fifth ordinary line to give the windows room to grow",
    ];
    const tr = makeTranscript(flat, 8); // 5 × 8s = 40s
    // Energy spike concentrated around the 3rd segment (~16–24s).
    const peaks = new Array(80).fill(0.1);
    for (let i = 32; i <= 48; i++) peaks[i] = 1; // 16s..24s at 40s/80 buckets
    const withEnergy = findClips(
      tr,
      { minDuration: 10, maxDuration: 20, maxClips: 3 },
      { peaks, peaksDuration: 40 },
    );
    expect(withEnergy.length).toBeGreaterThan(0);
    // The top clip should cover the loud moment.
    const top = withEnergy[0];
    expect(top.start).toBeLessThan(24);
    expect(top.end).toBeGreaterThan(16);
    // Its reason mentions the audio peak signal.
    expect(withEnergy.some((c) => /audio peak/.test(c.reason))).toBe(true);
  });

  it("handles an empty transcript", () => {
    expect(
      findClips(
        { words: [], segments: [], language: "en", source: "mock" },
        { minDuration: 30, maxDuration: 60, maxClips: 6 },
      ),
    ).toEqual([]);
  });
});
