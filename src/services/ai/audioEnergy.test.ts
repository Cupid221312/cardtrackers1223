import { describe, expect, it } from "vitest";
import { findEnergyPeaks, peaksToZoomKeyframes } from "@/services/ai/audioEnergy";

describe("findEnergyPeaks", () => {
  it("finds loud moments and ignores quiet stretches", () => {
    // 100 buckets over 50s (2/sec): quiet 0.1 with loud spikes at 10s & 30s.
    const peaks = new Array(100).fill(0.1);
    peaks[20] = 1; // 10s
    peaks[60] = 1; // 30s
    const found = findEnergyPeaks(peaks, 50, 0, 50);
    expect(found.length).toBeGreaterThanOrEqual(2);
    const times = found.map((p) => Math.round(p.time));
    expect(times).toContain(10);
    expect(times).toContain(30);
  });

  it("respects the clip window", () => {
    const peaks = new Array(100).fill(0.1);
    peaks[10] = 1; // 5s — outside window
    peaks[60] = 1; // 30s — inside
    const found = findEnergyPeaks(peaks, 50, 20, 50);
    expect(found.every((p) => p.time >= 20 && p.time <= 50)).toBe(true);
  });

  it("returns nothing for flat audio", () => {
    expect(findEnergyPeaks(new Array(100).fill(0.5), 50, 0, 50)).toHaveLength(0);
  });
});

describe("peaksToZoomKeyframes", () => {
  it("brackets each peak with zoom-in/out and stays 1× at the ends", () => {
    const kfs = peaksToZoomKeyframes([{ time: 15, energy: 1 }], 10, 25);
    expect(kfs[0].zoom).toBe(1);
    expect(kfs[kfs.length - 1].zoom).toBe(1);
    expect(kfs.some((k) => k.zoom > 1)).toBe(true);
    // Times are clip-relative and sorted.
    for (let i = 1; i < kfs.length; i++) {
      expect(kfs[i].time).toBeGreaterThanOrEqual(kfs[i - 1].time);
    }
  });
});
