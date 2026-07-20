import { describe, expect, it } from "vitest";
import {
  pathToKeyframes,
  trackConfidence,
  trackPoint,
} from "@/services/ai/pointTracker";

const W = 96;
const H = 54;

/** Frames with a bright 9x9 blob following (xs[f], ys[f]) on dark noise. */
function blobFrames(xs: number[], ys: number[]): Uint8Array {
  const pixels = new Uint8Array(W * H * xs.length);
  for (let f = 0; f < xs.length; f++) {
    const off = f * W * H;
    // deterministic dim background texture
    for (let i = 0; i < W * H; i++) pixels[off + i] = (i * 37) % 40;
    const bx = Math.round(xs[f] * (W - 1));
    const by = Math.round(ys[f] * (H - 1));
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = Math.min(W - 1, Math.max(0, bx + dx));
        const y = Math.min(H - 1, Math.max(0, by + dy));
        pixels[off + y * W + x] = 230;
      }
    }
  }
  return pixels;
}

describe("trackPoint", () => {
  it("follows a moving blob from a mid-clip anchor, both directions", () => {
    const n = 30;
    const xs = Array.from({ length: n }, (_, f) => 0.2 + (0.6 * f) / (n - 1));
    const ys = Array.from({ length: n }, () => 0.5);
    const startFrame = 15;
    const points = trackPoint(
      blobFrames(xs, ys),
      W,
      H,
      n,
      startFrame,
      xs[startFrame],
      0.5,
    );
    expect(points).toHaveLength(n);
    // Early frames tracked backward to the blob's earlier position.
    expect(points[0].x).toBeLessThan(0.3);
    // Late frames tracked forward.
    expect(points[n - 1].x).toBeGreaterThan(0.7);
    expect(trackConfidence(points)).toBeGreaterThan(0.6);
  });

  it("coasts instead of jumping when the subject vanishes", () => {
    const n = 20;
    const xs = Array.from({ length: n }, () => 0.5);
    const pixels = blobFrames(xs, xs.map(() => 0.5));
    // Erase the blob from the last 8 frames.
    pixels.fill(10, 12 * W * H);
    const points = trackPoint(pixels, W, H, n, 0, 0.5, 0.5);
    const lost = points.filter((p) => p.frame >= 13);
    // Held near the last known position with low confidence.
    for (const p of lost) {
      expect(Math.abs(p.x - 0.5)).toBeLessThan(0.2);
      expect(p.confidence).toBeLessThan(0.25);
    }
  });
});

describe("pathToKeyframes", () => {
  it("collapses a still off-center subject to one steady framing", () => {
    const points = Array.from({ length: 40 }, (_, f) => ({
      frame: f,
      x: 0.9,
      y: 0.5,
      confidence: 0.9,
    }));
    const kfs = pathToKeyframes(points, 8, 2.9, 0);
    expect(kfs).toHaveLength(1); // stable → single keyframe, no jitter
    expect(kfs[0].panX).toBeGreaterThan(0.8); // pushed right, clamped ≤ 1
    expect(kfs[0].panX).toBeLessThanOrEqual(1);
    expect(kfs[0].panY).toBe(0); // no vertical slack → axis fixed
    expect(kfs[0].zoom).toBe(1);
  });

  it("follows a moving subject with multiple keyframes", () => {
    const points = Array.from({ length: 40 }, (_, f) => ({
      frame: f,
      x: 0.2 + (0.6 * f) / 39, // pans left → right
      y: 0.5,
      confidence: 0.9,
    }));
    const kfs = pathToKeyframes(points, 8, 2.9, 0);
    expect(kfs.length).toBeGreaterThan(2);
    // Pan increases monotonically as the subject moves right.
    expect(kfs[kfs.length - 1].panX).toBeGreaterThan(kfs[0].panX);
  });
});
