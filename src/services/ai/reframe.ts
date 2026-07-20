import type { ZoomKeyframe } from "@/lib/types";

/**
 * Model-free auto-reframe: find where the action is by frame differencing.
 * The server decodes the clip to tiny grayscale frames; consecutive frames
 * are diffed, the centroid of changed pixels approximates the subject, an
 * EMA smooths jitter, and the path is downsampled into pan keyframes
 * (zoom stays 1 so exports can pan across the full source width).
 */

export interface MotionPoint {
  /** Seconds relative to the analyzed range start. */
  time: number;
  /** Centroid as fractions of frame size, 0..1. */
  x: number;
  y: number;
  /** Fraction of pixels that changed (0..1) — confidence proxy. */
  weight: number;
}

const DIFF_THRESHOLD = 18;

/** Per-pair motion centroids from packed grayscale rawvideo frames. */
export function motionCentroids(
  pixels: Uint8Array,
  width: number,
  height: number,
  fps: number,
): MotionPoint[] {
  const frameSize = width * height;
  const frameCount = Math.floor(pixels.length / frameSize);
  const points: MotionPoint[] = [];

  for (let f = 1; f < frameCount; f++) {
    const prev = (f - 1) * frameSize;
    const cur = f * frameSize;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let i = 0; i < frameSize; i++) {
      const d = Math.abs(pixels[cur + i] - pixels[prev + i]);
      if (d > DIFF_THRESHOLD) {
        sumX += i % width;
        sumY += (i / width) | 0;
        count++;
      }
    }
    points.push({
      time: f / fps,
      x: count > 0 ? sumX / count / width : 0.5,
      y: count > 0 ? sumY / count / height : 0.5,
      weight: count / frameSize,
    });
  }
  return points;
}

/**
 * EMA smoothing with confidence weighting: low-motion frames barely move
 * the tracked point, so a static shot doesn't wander on noise.
 */
export function smoothCentroids(
  points: MotionPoint[],
  alpha = 0.25,
  minWeight = 0.002,
): MotionPoint[] {
  let x = 0.5;
  let y = 0.5;
  return points.map((p) => {
    const a = p.weight < minWeight ? alpha * 0.15 : alpha;
    x += (p.x - x) * a;
    y += (p.y - y) * a;
    return { ...p, x, y };
  });
}

/**
 * Downsample the smoothed path into keyframes. Pan is the centroid offset
 * from center mapped to the -1..1 crop-slack range; vertical gain is lower
 * because 9:16 crops have far less vertical slack than horizontal.
 */
export function centroidsToKeyframes(
  points: MotionPoint[],
  options: { interval?: number; horizontalGain?: number; verticalGain?: number } = {},
): ZoomKeyframe[] {
  const { interval = 1.25, horizontalGain = 1.6, verticalGain = 0.5 } = options;
  if (points.length === 0) return [];

  const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));
  const keyframes: ZoomKeyframe[] = [];
  let nextTime = 0;
  for (const p of points) {
    if (p.time + 1e-6 < nextTime) continue;
    nextTime = p.time + interval;
    keyframes.push({
      id: `rf-${keyframes.length}`,
      time: Math.round(p.time * 100) / 100,
      zoom: 1,
      panX: clamp1((p.x - 0.5) * 2 * horizontalGain),
      panY: clamp1((p.y - 0.5) * 2 * verticalGain),
    });
  }

  // Drop interior keyframes that don't change the path (keeps ffmpeg
  // expressions short on static footage).
  const pruned = keyframes.filter((kf, i) => {
    if (i === 0 || i === keyframes.length - 1) return true;
    return (
      Math.abs(kf.panX - keyframes[i - 1].panX) > 0.03 ||
      Math.abs(kf.panY - keyframes[i - 1].panY) > 0.03
    );
  });
  return pruned;
}
