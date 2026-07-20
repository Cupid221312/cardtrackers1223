import type { Word } from "@/lib/types";

/**
 * Silence removal ("jump cuts") from word-level timestamps: any pause
 * between spoken words longer than minGap is cut. Produces KEEP segments
 * in source time; preview playback skips the gaps live, and the export
 * pipeline compacts them with select/aselect while remapping caption and
 * keyframe times onto the shortened timeline.
 */

export interface TimeRange {
  start: number;
  end: number;
}

const PAD = 0.12; // breathing room kept around speech, seconds
const MIN_SEGMENT = 0.25; // segments shorter than this merge or drop

/** Speech segments to keep within [clipStart, clipEnd]. */
export function computeKeepSegments(
  words: Word[],
  clipStart: number,
  clipEnd: number,
  minGap: number,
): TimeRange[] {
  const inClip = words.filter((w) => w.end > clipStart && w.start < clipEnd);
  if (inClip.length === 0) return [{ start: clipStart, end: clipEnd }];

  const segments: TimeRange[] = [];
  let cur: TimeRange = {
    start: Math.max(clipStart, inClip[0].start - PAD),
    end: Math.min(clipEnd, inClip[0].end + PAD),
  };
  for (let i = 1; i < inClip.length; i++) {
    const w = inClip[i];
    const gap = w.start - inClip[i - 1].end;
    if (gap > minGap) {
      segments.push(cur);
      cur = {
        start: Math.max(clipStart, w.start - PAD),
        end: Math.min(clipEnd, w.end + PAD),
      };
    } else {
      cur.end = Math.min(clipEnd, w.end + PAD);
    }
  }
  segments.push(cur);

  // Merge overlaps produced by padding, drop slivers.
  const merged: TimeRange[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && seg.start <= prev.end + 0.01) {
      prev.end = Math.max(prev.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged.filter((s) => s.end - s.start >= MIN_SEGMENT);
}

/** The complementary cut-away ranges (for timeline visualization). */
export function removedRanges(
  keep: TimeRange[],
  clipStart: number,
  clipEnd: number,
): TimeRange[] {
  const removed: TimeRange[] = [];
  let cursor = clipStart;
  for (const seg of keep) {
    if (seg.start > cursor + 0.01) removed.push({ start: cursor, end: seg.start });
    cursor = Math.max(cursor, seg.end);
  }
  if (clipEnd > cursor + 0.01) removed.push({ start: cursor, end: clipEnd });
  return removed;
}

/** Duration of the compacted output. */
export function compactDuration(keep: TimeRange[]): number {
  return keep.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/**
 * Maps a source-time to its position on the compacted timeline. Times
 * inside a cut collapse onto the cut point; monotonic non-decreasing.
 */
export function makeCompactMapper(keep: TimeRange[]): (t: number) => number {
  const offsets: number[] = [];
  let acc = 0;
  for (const seg of keep) {
    offsets.push(acc);
    acc += seg.end - seg.start;
  }
  const total = acc;
  return (t: number) => {
    for (let i = 0; i < keep.length; i++) {
      const seg = keep[i];
      if (t < seg.start) return offsets[i];
      if (t <= seg.end) return offsets[i] + (t - seg.start);
    }
    return total;
  };
}

/**
 * For live preview: the next playable source-time at or after t, or null
 * when t is past the final keep segment (caller loops the clip).
 */
export function nextKeepTime(keep: TimeRange[], t: number): number | null {
  for (const seg of keep) {
    if (t < seg.start) return seg.start;
    if (t <= seg.end) return t;
  }
  return null;
}
