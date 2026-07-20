import { describe, expect, it } from "vitest";
import { centeredMovingAverage, isStable } from "@/services/ai/smoothing";

describe("centeredMovingAverage", () => {
  it("returns the series unchanged for window <= 1", () => {
    expect(centeredMovingAverage([1, 2, 3], 1)).toEqual([1, 2, 3]);
  });

  it("smooths a spike without introducing lag", () => {
    const out = centeredMovingAverage([0, 0, 10, 0, 0], 3);
    // The spike is spread onto its neighbors symmetrically (no phase shift):
    // index 1,2,3 each average in the 10.
    expect(out[2]).toBeCloseTo(10 / 3, 5);
    expect(out[1]).toBeCloseTo(10 / 3, 5);
    expect(out[3]).toBeCloseTo(10 / 3, 5);
    // Symmetric around the spike → zero lag.
    expect(out[1]).toBeCloseTo(out[3], 5);
  });

  it("tracks a ramp closely (centered = no trailing)", () => {
    const ramp = Array.from({ length: 20 }, (_, i) => i);
    const out = centeredMovingAverage(ramp, 5);
    // Interior points of a linear ramp are unchanged by a symmetric mean.
    expect(out[10]).toBeCloseTo(10, 5);
  });
});

describe("isStable", () => {
  it("detects a near-constant series", () => {
    expect(isStable([0.5, 0.51, 0.49, 0.5], 0.06)).toBe(true);
  });
  it("detects a moving series", () => {
    expect(isStable([0.2, 0.4, 0.6, 0.8], 0.06)).toBe(false);
  });
  it("treats empty as stable", () => {
    expect(isStable([], 0.06)).toBe(true);
  });
});
