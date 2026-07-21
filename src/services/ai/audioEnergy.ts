/**
 * Audio-energy peak detection over the normalized waveform buckets the
 * /api/media/[id]/waveform endpoint already produces. Finds the loudest
 * moments in a clip — laughter, shouts, hype, drops — so the editor can
 * punch in on them automatically. Pure and deterministic.
 */

export interface EnergyPeak {
  /** Source time of the peak, seconds. */
  time: number;
  /** 0..1 loudness at the peak. */
  energy: number;
}

/**
 * Prominent energy peaks inside [start, end] of the source.
 * @param peaks    normalized 0..1 waveform buckets spanning the whole media
 * @param totalDuration source duration the buckets span
 */
export function findEnergyPeaks(
  peaks: number[],
  totalDuration: number,
  start: number,
  end: number,
  options: { minGap?: number; relativeThreshold?: number; max?: number } = {},
): EnergyPeak[] {
  const { minGap = 2.5, relativeThreshold = 1.25, max = 12 } = options;
  if (peaks.length === 0 || totalDuration <= 0) return [];

  const perSec = peaks.length / totalDuration;
  const i0 = Math.max(0, Math.floor(start * perSec));
  const i1 = Math.min(peaks.length, Math.ceil(end * perSec));
  if (i1 - i0 < 3) return [];

  // Smooth slightly so single-sample spikes don't dominate.
  const win = Math.max(1, Math.round(perSec * 0.15));
  const smooth = (i: number) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(i0, i - win); j <= Math.min(i1 - 1, i + win); j++) {
      sum += peaks[j];
      n++;
    }
    return n ? sum / n : 0;
  };

  // Mean energy in-range sets the "loud" bar.
  let mean = 0;
  for (let i = i0; i < i1; i++) mean += peaks[i];
  mean /= i1 - i0;
  const threshold = mean * relativeThreshold;

  const gapBuckets = minGap * perSec;
  const found: EnergyPeak[] = [];
  for (let i = i0 + 1; i < i1 - 1; i++) {
    const e = smooth(i);
    if (e < threshold) continue;
    // Local maximum.
    if (e < smooth(i - 1) || e < smooth(i + 1)) continue;
    const time = i / perSec;
    const last = found[found.length - 1];
    if (last && i - last.time * perSec < gapBuckets) {
      // Keep the louder of two close peaks.
      if (e > last.energy) found[found.length - 1] = { time, energy: e };
      continue;
    }
    found.push({ time, energy: e });
  }

  return found.sort((a, b) => b.energy - a.energy).slice(0, max).sort((a, b) => a.time - b.time);
}

/**
 * Turn energy peaks into a punch-in zoom keyframe track (clip-relative
 * times). Each peak zooms in briefly then settles back to 1×.
 */
export function peaksToZoomKeyframes(
  peaks: EnergyPeak[],
  clipStart: number,
  clipEnd: number,
  zoom = 1.18,
): Array<{ id: string; time: number; zoom: number; panX: number; panY: number }> {
  const kfs: Array<{ id: string; time: number; zoom: number; panX: number; panY: number }> = [];
  const rel = (t: number) => Math.max(0, Math.min(clipEnd - clipStart, t - clipStart));
  let n = 0;
  const push = (t: number, z: number) => {
    const time = Math.round(rel(t) * 100) / 100;
    if (kfs.length && Math.abs(kfs[kfs.length - 1].time - time) < 0.05) return;
    kfs.push({ id: `az-${n++}`, time, zoom: z, panX: 0, panY: 0 });
  };
  push(clipStart, 1);
  for (const p of peaks) {
    if (p.time <= clipStart + 0.3 || p.time >= clipEnd - 0.3) continue;
    push(p.time - 0.25, 1);
    push(p.time, zoom);
    push(p.time + 0.6, 1);
  }
  push(clipEnd, 1);
  return kfs;
}
