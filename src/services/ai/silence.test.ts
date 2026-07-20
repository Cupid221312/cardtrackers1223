import { describe, expect, it } from "vitest";
import {
  compactDuration,
  computeKeepSegments,
  makeCompactMapper,
  nextKeepTime,
  removedRanges,
} from "@/services/ai/silence";
import type { Word } from "@/lib/types";

const words = (specs: Array<[number, number]>): Word[] =>
  specs.map(([start, end], i) => ({ id: `w${i}`, text: "x", start, end }));

// Speech at 0-2s and 5-7s with a 3s silence between, inside a 0-10 clip.
const SPEECH = words([
  [0.2, 0.8],
  [0.9, 2.0],
  [5.0, 5.6],
  [5.7, 7.0],
]);

describe("computeKeepSegments", () => {
  it("keeps padded speech and cuts long gaps", () => {
    const keep = computeKeepSegments(SPEECH, 0, 10, 0.6);
    expect(keep).toHaveLength(2);
    expect(keep[0].start).toBeCloseTo(0.08, 1);
    expect(keep[0].end).toBeCloseTo(2.12, 1);
    expect(keep[1].start).toBeCloseTo(4.88, 1);
    expect(keep[1].end).toBeCloseTo(7.12, 1);
  });

  it("keeps everything when gaps are under the threshold", () => {
    const keep = computeKeepSegments(SPEECH, 0, 10, 5);
    expect(keep).toHaveLength(1);
  });

  it("keeps the whole clip when there are no words", () => {
    expect(computeKeepSegments([], 3, 9, 0.6)).toEqual([{ start: 3, end: 9 }]);
  });
});

describe("removedRanges / compactDuration", () => {
  it("returns complementary cut ranges covering lead/mid/tail silence", () => {
    const keep = computeKeepSegments(SPEECH, 0, 10, 0.6);
    const removed = removedRanges(keep, 0, 10);
    expect(removed).toHaveLength(3); // before, between, after speech
    const total = compactDuration(keep) + compactDuration(removed);
    expect(total).toBeCloseTo(10, 5);
  });
});

describe("makeCompactMapper", () => {
  const keep = [
    { start: 1, end: 3 },
    { start: 6, end: 8 },
  ];
  const map = makeCompactMapper(keep);

  it("is monotonic and collapses cuts onto cut points", () => {
    expect(map(0)).toBe(0); // before first keep
    expect(map(1)).toBe(0);
    expect(map(2.5)).toBeCloseTo(1.5);
    expect(map(3)).toBeCloseTo(2);
    expect(map(4.5)).toBeCloseTo(2); // inside the cut
    expect(map(6)).toBeCloseTo(2);
    expect(map(7)).toBeCloseTo(3);
    expect(map(9)).toBeCloseTo(4); // past the end → total
  });
});

describe("nextKeepTime", () => {
  const keep = [
    { start: 1, end: 3 },
    { start: 6, end: 8 },
  ];
  it("jumps ahead out of silences and signals the end", () => {
    expect(nextKeepTime(keep, 0)).toBe(1);
    expect(nextKeepTime(keep, 2)).toBe(2);
    expect(nextKeepTime(keep, 4)).toBe(6);
    expect(nextKeepTime(keep, 9)).toBeNull();
  });
});
