import { describe, expect, it } from "vitest";
import { emojiFor, isKeyword } from "@/services/ai/captionDecor";

describe("isKeyword", () => {
  it("flags numbers, money, and power words", () => {
    expect(isKeyword("$50,000")).toBe(true);
    expect(isKeyword("100%")).toBe(true);
    expect(isKeyword("10x")).toBe(true);
    expect(isKeyword("biggest")).toBe(true);
    expect(isKeyword("never")).toBe(true);
  });
  it("ignores ordinary words and punctuation", () => {
    expect(isKeyword("the")).toBe(false);
    expect(isKeyword("walked")).toBe(false);
    expect(isKeyword("...")).toBe(false);
  });
  it("matches power words regardless of trailing punctuation", () => {
    expect(isKeyword("secret,")).toBe(true);
    expect(isKeyword("STOP!")).toBe(true);
  });
});

describe("emojiFor", () => {
  it("maps themed words to emoji", () => {
    expect(emojiFor("money")).toBe("💰");
    expect(emojiFor("insane")).toBe("🔥");
    expect(emojiFor("growth")).toBe("📈");
  });
  it("returns empty for unrelated words", () => {
    expect(emojiFor("table")).toBe("");
    expect(emojiFor("")).toBe("");
  });
});
