import type { ZoomKeyframe } from "@/lib/types";

/**
 * Compiles zoom/pan keyframes into FFmpeg `zoompan` expressions so exports
 * animate exactly like the preview (same smoothstep easing as
 * interpolateKeyframes in the editor store).
 *
 * `t` is an expression for the current time in seconds (e.g. "(on/60)").
 * Output is a piecewise function built from nested if()s:
 *   before first keyframe → first value
 *   between keyframes     → smoothstep-eased interpolation
 *   after last keyframe   → last value
 */
export function keyframeExpr(
  keyframes: ZoomKeyframe[],
  field: "zoom" | "panX" | "panY",
  t: string,
): string {
  const value = (k: ZoomKeyframe) => k[field];
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (sorted.length === 0) return field === "zoom" ? "1" : "0";
  if (sorted.length === 1) return value(sorted[0]).toFixed(4);

  let expr = value(sorted[sorted.length - 1]).toFixed(4);
  for (let i = sorted.length - 2; i >= 0; i--) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const dt = Math.max(b.time - a.time, 0.001);
    const f = `((${t}-${a.time.toFixed(3)})/${dt.toFixed(3)})`;
    const eased = `(${f}*${f}*(3-2*${f}))`;
    const segment = `(${value(a).toFixed(4)}+${(value(b) - value(a)).toFixed(4)}*${eased})`;
    expr = `if(lt(${t},${b.time.toFixed(3)}),${segment},${expr})`;
  }
  return `if(lt(${t},${sorted[0].time.toFixed(3)}),${value(sorted[0]).toFixed(4)},${expr})`;
}

/**
 * Full zoompan filter animating keyframes over an already-framed
 * 1080x1920 stream. x/y center the crop window, then offset it by the
 * pan fraction of the available slack — matching the static crop math.
 */
/**
 * Pan-only animation (every keyframe at zoom 1): an animated crop over the
 * cover-scaled source. Unlike zoompan — which can only look inside the
 * already-cropped 9:16 frame — this pans the crop window across the FULL
 * source width/height, which is what auto-reframe needs. crop evaluates
 * x/y per frame with `t` in seconds (0 at the clip start post-trim).
 */
export function animatedCropFilter(
  keyframes: ZoomKeyframe[],
  width: number,
  height: number,
): string {
  const px = keyframeExpr(keyframes, "panX", "t");
  const py = keyframeExpr(keyframes, "panY", "t");
  return (
    `crop=${width}:${height}` +
    `:x='(iw-${width})/2+(${px})*(iw-${width})/2'` +
    `:y='(ih-${height})/2+(${py})*(ih-${height})/2'`
  );
}

export function zoompanFilter(
  keyframes: ZoomKeyframe[],
  width: number,
  height: number,
  fps: number,
): string {
  const t = `(on/${fps})`;
  const z = keyframeExpr(keyframes, "zoom", t);
  const px = keyframeExpr(keyframes, "panX", t);
  const py = keyframeExpr(keyframes, "panY", t);
  return (
    `zoompan=z='${z}'` +
    `:x='(iw-iw/zoom)/2+(${px})*(iw-iw/zoom)/2'` +
    `:y='(ih-ih/zoom)/2+(${py})*(ih-ih/zoom)/2'` +
    `:d=1:s=${width}x${height}:fps=${fps}`
  );
}
