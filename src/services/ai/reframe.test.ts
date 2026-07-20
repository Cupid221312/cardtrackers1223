import { describe, expect, it } from "vitest";
import {
  centroidsToKeyframes,
  motionCentroids,
  smoothCentroids,
} from "@/services/ai/reframe";

/** Frames with a bright 4x4 block moving left→right on black. */
function movingBlockFrames(w: number, h: number, count: number): Uint8Array {
  const pixels = new Uint8Array(w * h * count);
  for (let f = 0; f < count; f++) {
    const bx = Math.round((f / (count - 1)) * (w - 5));
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        pixels[f * w * h + (h / 2 + dy) * w + bx + dx] = 255;
      }
    }
  }
  return pixels;
}

describe("motionCentroids", () => {
  it("tracks a moving block from left to right", () => {
    const points = motionCentroids(movingBlockFrames(64, 36, 20), 64, 36, 4);
    expect(points).toHaveLength(19);
    expect(points[0].x).toBeLessThan(0.25);
    expect(points[points.length - 1].x).toBeGreaterThan(0.75);
    expect(points.every((p) => p.weight > 0)).toBe(true);
  });

  it("stays centered on static frames", () => {
    const points = motionCentroids(new Uint8Array(64 * 36 * 5), 64, 36, 4);
    expect(points.every((p) => p.x === 0.5 && p.weight === 0)).toBe(true);
  });
});

describe("smoothCentroids", () => {
  it("barely moves on low-confidence noise", () => {
    const noisy = [
      { time: 0.25, x: 0.9, y: 0.9, weight: 0.0001 },
      { time: 0.5, x: 0.1, y: 0.1, weight: 0.0001 },
    ];
    const smoothed = smoothCentroids(noisy);
    for (const p of smoothed) {
      expect(Math.abs(p.x - 0.5)).toBeLessThan(0.05);
    }
  });

  it("converges toward sustained motion", () => {
    const sustained = Array.from({ length: 30 }, (_, i) => ({
      time: i * 0.25,
      x: 0.85,
      y: 0.5,
      weight: 0.05,
    }));
    const smoothed = smoothCentroids(sustained);
    expect(smoothed[smoothed.length - 1].x).toBeGreaterThan(0.75);
  });
});

describe("centroidsToKeyframes", () => {
  it("produces sorted pan-only keyframes at the sample interval", () => {
    const points = Array.from({ length: 40 }, (_, i) => ({
      time: i * 0.25,
      x: 0.5 + 0.3 * Math.sin(i / 6),
      y: 0.5,
      weight: 0.05,
    }));
    const kfs = centroidsToKeyframes(points);
    expect(kfs.length).toBeGreaterThan(2);
    expect(kfs.every((k) => k.zoom === 1)).toBe(true);
    expect(kfs.every((k) => k.panX >= -1 && k.panX <= 1)).toBe(true);
    for (let i = 1; i < kfs.length; i++) {
      expect(kfs[i].time).toBeGreaterThan(kfs[i - 1].time);
    }
  });

  it("prunes redundant keyframes on a static path", () => {
    const points = Array.from({ length: 40 }, (_, i) => ({
      time: i * 0.25,
      x: 0.5,
      y: 0.5,
      weight: 0.01,
    }));
    const kfs = centroidsToKeyframes(points);
    expect(kfs.length).toBeLessThanOrEqual(2);
  });
});
