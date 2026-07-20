import type { ZoomKeyframe } from "@/lib/types";
import { centeredMovingAverage, isStable } from "@/services/ai/smoothing";

/**
 * Click-to-track subject tracking without an ML model: classic template
 * matching. The user drops a dot on a subject; we take a small grayscale
 * patch around it and follow that patch frame-to-frame with an SSD search
 * in a local window, blending the template slowly so gradual appearance
 * changes don't break the lock. Low-confidence frames coast on the last
 * known position instead of jumping to noise.
 */

export interface TrackedPoint {
  frame: number;
  /** Position as fractions of frame size, 0..1. */
  x: number;
  y: number;
  /** 0..1 match quality (1 = perfect patch match). */
  confidence: number;
}

const PATCH_R = 7; // template = 15x15 px
const SEARCH_R = 12; // per-step search window, px
const TEMPLATE_BLEND = 0.12;
const COAST_BELOW = 0.25;

function samplePatch(
  pixels: Uint8Array,
  frameOffset: number,
  w: number,
  h: number,
  cx: number,
  cy: number,
  out: Float32Array,
): void {
  let i = 0;
  for (let dy = -PATCH_R; dy <= PATCH_R; dy++) {
    const y = Math.min(h - 1, Math.max(0, cy + dy));
    for (let dx = -PATCH_R; dx <= PATCH_R; dx++) {
      const x = Math.min(w - 1, Math.max(0, cx + dx));
      out[i++] = pixels[frameOffset + y * w + x];
    }
  }
}

function ssd(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  // Normalize to 0..1 by the worst case (full-scale difference).
  return sum / (a.length * 255 * 255);
}

/**
 * Track a point through packed grayscale frames, both directions from
 * startFrame. Returns one point per frame, frame-ordered.
 */
export function trackPoint(
  pixels: Uint8Array,
  width: number,
  height: number,
  frameCount: number,
  startFrame: number,
  startX: number,
  startY: number,
): TrackedPoint[] {
  const frameSize = width * height;
  const clampFrame = Math.min(Math.max(0, startFrame), frameCount - 1);
  const sx = Math.round(startX * (width - 1));
  const sy = Math.round(startY * (height - 1));

  const patchLen = (PATCH_R * 2 + 1) ** 2;
  const candidate = new Float32Array(patchLen);

  const runDirection = (dir: 1 | -1): TrackedPoint[] => {
    const template = new Float32Array(patchLen);
    samplePatch(pixels, clampFrame * frameSize, width, height, sx, sy, template);
    let px = sx;
    let py = sy;
    const points: TrackedPoint[] = [];
    for (
      let f = clampFrame + dir;
      dir === 1 ? f < frameCount : f >= 0;
      f += dir
    ) {
      const off = f * frameSize;
      let bestScore = Infinity;
      let bestX = px;
      let bestY = py;
      for (let dy = -SEARCH_R; dy <= SEARCH_R; dy += 1) {
        for (let dx = -SEARCH_R; dx <= SEARCH_R; dx += 1) {
          const cx = px + dx;
          const cy = py + dy;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          samplePatch(pixels, off, width, height, cx, cy, candidate);
          const score = ssd(template, candidate);
          if (score < bestScore) {
            bestScore = score;
            bestX = cx;
            bestY = cy;
          }
        }
      }
      const confidence = Math.max(0, 1 - bestScore * 12);
      if (confidence >= COAST_BELOW) {
        px = bestX;
        py = bestY;
        // Slowly adapt the template to the subject's current appearance.
        samplePatch(pixels, off, width, height, px, py, candidate);
        for (let i = 0; i < patchLen; i++) {
          template[i] =
            template[i] * (1 - TEMPLATE_BLEND) + candidate[i] * TEMPLATE_BLEND;
        }
      }
      points.push({
        frame: f,
        x: px / (width - 1),
        y: py / (height - 1),
        confidence,
      });
    }
    return points;
  };

  const backward = runDirection(-1).reverse();
  const anchor: TrackedPoint = {
    frame: clampFrame,
    x: startX,
    y: startY,
    confidence: 1,
  };
  const forward = runDirection(1);
  return [...backward, anchor, ...forward];
}

/**
 * Convert a tracked path into pan keyframes that keep the subject
 * centered in the 9:16 crop. gainX/gainY translate "how far off-center
 * the subject is" into the pan needed to center it, given how much crop
 * slack the source has on that axis (0 = no slack, axis stays fixed).
 */
export function pathToKeyframes(
  points: TrackedPoint[],
  fps: number,
  gainX: number,
  gainY: number,
  interval = 0.5,
): ZoomKeyframe[] {
  if (points.length === 0) return [];
  const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

  // trackPoint already coasts on low-confidence frames (holds the last
  // good position), so the raw path is clean enough for a zero-lag
  // centered moving average — no trailing/EMA lag.
  const win = Math.max(3, Math.round(fps * 0.8));
  const xs = centeredMovingAverage(points.map((p) => p.x), win);
  const ys = centeredMovingAverage(points.map((p) => p.y), win);

  // Near-still subject → one steady framing instead of animated jitter.
  const stable =
    isStable(xs, 0.06) && isStable(ys, 0.06);
  const panX = (x: number) => clamp1((x - 0.5) * gainX);
  const panY = (y: number) => clamp1((y - 0.5) * gainY);

  if (stable) {
    const avgX = xs.reduce((s, v) => s + v, 0) / xs.length;
    const avgY = ys.reduce((s, v) => s + v, 0) / ys.length;
    return [
      { id: "trk-0", time: 0, zoom: 1, panX: panX(avgX), panY: panY(avgY) },
    ];
  }

  const keyframes: ZoomKeyframe[] = [];
  let nextTime = 0;
  for (let i = 0; i < points.length; i++) {
    const t = points[i].frame / fps;
    if (i > 0 && t + 1e-6 < nextTime) continue;
    nextTime = t + interval;
    keyframes.push({
      id: `trk-${keyframes.length}`,
      time: Math.round(t * 100) / 100,
      zoom: 1,
      panX: panX(xs[i]),
      panY: panY(ys[i]),
    });
  }

  return keyframes.filter((kf, i) => {
    if (i === 0 || i === keyframes.length - 1) return true;
    return (
      Math.abs(kf.panX - keyframes[i - 1].panX) > 0.02 ||
      Math.abs(kf.panY - keyframes[i - 1].panY) > 0.02
    );
  });
}

/** Mean confidence — how solid the lock was across the clip. */
export function trackConfidence(points: TrackedPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((s, p) => s + p.confidence, 0) / points.length;
}
