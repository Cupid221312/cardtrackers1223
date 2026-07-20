import type { CaptionLine, Word } from "@/lib/types";

const LINE_MAX_SECONDS = 2.2;
const BREAK_PUNCTUATION = /[.!?,;:]$/;

/**
 * Group word-level transcript timestamps into short caption lines suitable
 * for karaoke-style rendering. Lines break on punctuation, word-count, or
 * elapsed time, whichever comes first — mirroring how Opus/Descript chunk
 * captions for vertical video.
 */
export function buildCaptionLines(
  words: Word[],
  maxWordsPerLine: number,
): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      id: `line-${lines.length}-${current[0].id}`,
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (const word of words) {
    if (
      current.length > 0 &&
      (current.length >= maxWordsPerLine ||
        word.end - current[0].start > LINE_MAX_SECONDS ||
        // A silence gap between words starts a fresh line.
        word.start - current[current.length - 1].end > 0.8)
    ) {
      flush();
    }
    current.push(word);
    if (BREAK_PUNCTUATION.test(word.text)) flush();
  }
  flush();
  return lines;
}

/** Caption lines overlapping a [start, end] source-time window. */
export function linesInRange(
  lines: CaptionLine[],
  start: number,
  end: number,
): CaptionLine[] {
  return lines.filter((l) => l.end > start && l.start < end);
}

/** The line being spoken at time t, or null between lines. */
export function activeLineAt(
  lines: CaptionLine[],
  t: number,
): CaptionLine | null {
  // Lines are time-ordered; linear scan is fine at caption scale.
  for (const line of lines) {
    if (t >= line.start && t <= line.end) return line;
    if (line.start > t) break;
  }
  return null;
}

/** Index of the word being spoken inside a line at time t (-1 if none yet). */
export function activeWordIndex(line: CaptionLine, t: number): number {
  let active = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (t >= line.words[i].start) active = i;
  }
  return active;
}
