import { describe, expect, it } from "vitest";
import {
  activeLineAt,
  activeWordIndex,
  buildCaptionLines,
  linesInRange,
} from "@/services/ai/captions";
import type { Word } from "@/lib/types";

function words(specs: Array<[string, number, number]>): Word[] {
  return specs.map(([text, start, end], i) => ({
    id: `w-${i}`,
    text,
    start,
    end,
  }));
}

describe("buildCaptionLines", () => {
  it("groups words up to the max per line", () => {
    const lines = buildCaptionLines(
      words([
        ["one", 0, 0.3],
        ["two", 0.35, 0.6],
        ["three", 0.65, 0.9],
        ["four", 0.95, 1.2],
        ["five", 1.25, 1.5],
      ]),
      2,
    );
    expect(lines.map((l) => l.words.length)).toEqual([2, 2, 1]);
    expect(lines[0].start).toBe(0);
    expect(lines[0].end).toBe(0.6);
  });

  it("breaks lines on terminal punctuation", () => {
    const lines = buildCaptionLines(
      words([
        ["hello.", 0, 0.3],
        ["world", 0.35, 0.6],
      ]),
      5,
    );
    expect(lines).toHaveLength(2);
  });

  it("breaks lines on silence gaps", () => {
    const lines = buildCaptionLines(
      words([
        ["before", 0, 0.3],
        ["after", 2.0, 2.3],
      ]),
      5,
    );
    expect(lines).toHaveLength(2);
  });
});

describe("active line/word lookup", () => {
  const lines = buildCaptionLines(
    words([
      ["a", 0, 0.5],
      ["b", 0.5, 1.0],
      ["c", 2.0, 2.5],
    ]),
    2,
  );

  it("finds the line covering the playhead", () => {
    expect(activeLineAt(lines, 0.7)?.words[0].text).toBe("a");
    expect(activeLineAt(lines, 1.5)).toBeNull();
  });

  it("finds the active word index", () => {
    const line = activeLineAt(lines, 0.7)!;
    expect(activeWordIndex(line, 0.2)).toBe(0);
    expect(activeWordIndex(line, 0.7)).toBe(1);
  });

  it("selects lines overlapping a clip range", () => {
    expect(linesInRange(lines, 1.8, 3)).toHaveLength(1);
  });
});
