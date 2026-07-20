/**
 * Trajectory smoothing shared by the motion-reframe and click-to-track
 * paths. Technique adapted from OpenMontage's auto_reframe (AGPLv3) —
 * reimplemented independently here, not copied: a centered (non-causal)
 * moving average, plus a stability test that collapses a near-still
 * subject to a single steady framing instead of animating jitter.
 *
 * Because ClipForge computes the whole trajectory server-side before
 * emitting keyframes, a centered window is available and removes the lag
 * a causal EMA introduces (the subject was trailing the crop before).
 */

/** Zero-lag centered moving average over a value series. */
export function centeredMovingAverage(
  values: number[],
  window: number,
): number[] {
  if (window <= 1 || values.length === 0) return values.slice();
  const half = Math.floor(window / 2);
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/** True when the series stays within `threshold` of its mean (near-still). */
export function isStable(values: number[], threshold: number): boolean {
  if (values.length === 0) return true;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min < threshold;
}
