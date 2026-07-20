import type { CaptionLine, Word } from "@/lib/types";

const SENTENCE_END = /[.!?]$/;
const CLAUSE_END = /[.!?,;:]$/;

/**
 * Group word-level transcript timestamps into caption lines. Lines break
 * on punctuation, word-count, or elapsed time, whichever comes first.
 *
 * Small word budgets (karaoke bursts) also break on clause punctuation
 * (commas/colons); larger budgets (phrase mode, Reels-style) only break on
 * sentence enders so "POV: you got tired of editing…" stays one caption.
 * The time cap scales with the budget so long phrases aren't cut short.
 */
export function buildCaptionLines(
  words: Word[],
  maxWordsPerLine: number,
): CaptionLine[] {
  const maxSeconds = Math.max(2.2, maxWordsPerLine * 0.55);
  const breakRe = maxWordsPerLine >= 6 ? SENTENCE_END : CLAUSE_END;
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
        word.end - current[0].start > maxSeconds ||
        // A silence gap between words starts a fresh line.
        word.start - current[current.length - 1].end > 0.8)
    ) {
      flush();
    }
    current.push(word);
    if (breakRe.test(word.text)) flush();
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

/**
 * The line being spoken at time t, or null between lines. `hold` keeps a
 * finished line on screen for up to that many extra seconds (or until the
 * next line starts) — phrase-style captions use this so text doesn't
 * flicker off between sentences.
 */
export function activeLineAt(
  lines: CaptionLine[],
  t: number,
  hold = 0,
): CaptionLine | null {
  // Lines are time-ordered; linear scan is fine at caption scale.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.start > t) break;
    const next = lines[i + 1];
    const visibleUntil = Math.min(
      line.end + hold,
      next ? next.start : Infinity,
    );
    if (t >= line.start && t <= Math.max(line.end, visibleUntil)) return line;
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
