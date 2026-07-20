import { describe, expect, it } from "vitest";
import { clamp, formatTime, formatTimecode } from "@/lib/time";

describe("formatTime", () => {
  it("formats minutes and hours", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3671)).toBe("1:01:11");
  });
  it("tolerates bad input", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
});

describe("formatTimecode", () => {
  it("includes tenths", () => {
    expect(formatTimecode(12.34)).toBe("0:12.3");
  });
});

describe("clamp", () => {
  it("clamps to bounds", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
  });
});
