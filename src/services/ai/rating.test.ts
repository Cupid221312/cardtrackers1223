import { describe, expect, it } from "vitest";
import {
  extractKeywords,
  overallScore,
  rateClip,
  toGrade,
} from "@/services/ai/rating";
import type { TranscriptSegment } from "@/lib/types";

function segs(texts: string[]): TranscriptSegment[] {
  let t = 0;
  return texts.map((text, i) => {
    const start = t;
    const words = text.split(" ");
    t += words.length * 0.4;
    return {
      id: `s${i}`,
      text,
      start,
      end: t,
      wordIds: words.map((_, j) => `w${i}-${j}`),
    };
  });
}

describe("rateClip", () => {
  it("rates a hooky, valuable clip higher than filler", () => {
    const hooky = segs([
      "Here's why most people fail at this completely.",
      "The biggest mistake cost me 50000 dollars because I ignored the framework.",
      "This is insane and it will blow your mind.",
    ]);
    const filler = segs([
      "So anyway we walked over there and looked around a bit.",
      "It was kind of a normal afternoon nothing much happened really.",
      "Then we went home and that was pretty much the day.",
    ]);
    const hookyRating = rateClip(hooky, 0, hooky[hooky.length - 1].end);
    const fillerRating = rateClip(filler, 0, filler[filler.length - 1].end);
    expect(overallScore(hookyRating)).toBeGreaterThan(overallScore(fillerRating));
    expect(hookyRating.hook).toBeGreaterThan(fillerRating.hook);
    expect(hookyRating.value).toBeGreaterThan(fillerRating.value);
  });

  it("keeps every axis and the overall in 0..99", () => {
    const r = rateClip(segs(["one two three four five"]), 0, 2);
    for (const v of [r.hook, r.flow, r.value, r.trend, overallScore(r)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(99);
    }
  });
});

describe("toGrade", () => {
  it("maps scores to letter grades", () => {
    expect(toGrade(97)).toBe("A+");
    expect(toGrade(90)).toBe("A");
    expect(toGrade(84)).toBe("A-");
    expect(toGrade(40)).toBe("D");
  });
});

describe("extractKeywords", () => {
  it("returns frequent content words, skipping stopwords", () => {
    const kw = extractKeywords(
      "money money money the a of business business growth strategy",
    );
    expect(kw[0]).toBe("money");
    expect(kw).toContain("business");
    expect(kw).not.toContain("the");
  });
});
