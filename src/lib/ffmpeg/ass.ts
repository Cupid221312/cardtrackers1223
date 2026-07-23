import type {
  CaptionLine,
  CaptionStyle,
  GraphicOverlay,
  HookBanner,
  ProgressBarSettings,
} from "@/lib/types";
import { emojiFor, isKeyword } from "@/services/ai/captionDecor";

/**
 * Generates an .ass subtitle file that reproduces the preview's karaoke
 * captions and hook banner at 1080x1920. Word-level highlighting is done
 * with one Dialogue event per word (whole line rendered, active word
 * recolored inline) — exact and renderer-agnostic, unlike \k karaoke fill.
 */

const DEFAULT_PLAY_W = 1080;
const DEFAULT_PLAY_H = 1920;

/** #rrggbb (+optional alpha 0..1) → ASS &HAABBGGRR& */
function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const rgb = m ? m[1] : "ffffff";
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function assTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
}

export function buildAssDocument(opts: {
  lines: CaptionLine[];
  style: CaptionStyle;
  banner: HookBanner;
  /** Source-time of the clip start; events are emitted clip-relative. */
  clipStart: number;
  clipEnd: number;
  /**
   * Maps a source-time to the output timeline. Defaults to clip-relative
   * identity; the exporter passes a compacting mapper when silence
   * removal is active so captions stay in sync with the jump cuts.
   */
  timeMap?: (t: number) => number;
  progressBar?: ProgressBarSettings;
  /** Timed motion-graphic overlays (source-time, mapped like captions). */
  overlays?: GraphicOverlay[];
  /** Output-timeline duration (seconds); used to animate the progress bar. */
  outDuration?: number;
  /** Output canvas size; defaults to 1080x1920 (9:16). */
  playW?: number;
  playH?: number;
}): string {
  const { lines, style, banner, clipStart, clipEnd } = opts;
  const PLAY_W = opts.playW ?? DEFAULT_PLAY_W;
  const PLAY_H = opts.playH ?? DEFAULT_PLAY_H;
  const map = opts.timeMap ?? ((t: number) => t - clipStart);
  const outEnd = map(clipEnd);

  const fontSize = Math.round(style.fontSize * PLAY_H);
  const outline = Math.max(0, Math.round(style.strokeWidth * fontSize * 0.45));
  const shadow = style.shadow ? Math.max(1, Math.round(fontSize * 0.07)) : 0;
  const bold = style.fontWeight >= 600 ? -1 : 0;
  // ASS MarginV is measured from the bottom edge for alignment 2.
  const captionMarginV = Math.round(
    PLAY_H - style.verticalPosition * PLAY_H - fontSize * 1.4,
  );

  const bannerFontSize = Math.round(PLAY_H * 0.032);
  const bannerMarginV = Math.round(banner.verticalPosition * PLAY_H);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${PLAY_W}`,
    `PlayResY: ${PLAY_H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Caption style: alignment 2 = bottom-center.
    `Style: Caption,${style.fontFamily},${fontSize},${assColor(style.textColor)},${assColor(style.textColor)},${assColor(style.strokeColor || "#000000")},${assColor("#000000", 0.4)},${bold},0,0,0,100,100,1,0,1,${outline},${shadow},2,120,120,${Math.max(0, captionMarginV)},1`,
    // Banner style: alignment 8 = top-center, BorderStyle 4 = background box.
    `Style: Banner,${style.fontFamily},${bannerFontSize},${assColor(banner.textColor)},${assColor(banner.textColor)},${assColor(banner.bgColor)},${assColor(banner.bgColor)},-1,0,0,0,100,100,1,0,4,${Math.round(bannerFontSize * 0.3)},0,8,70,70,${bannerMarginV},1`,
    // Progress bar: plain fill style, drawn as a vector rectangle.
    `Style: Progress,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    // Overlay (box): opaque box behind text — cards & CTA pills. Alignment 5
    // = middle-center so \pos anchors on the graphic's center. Outline value
    // pads the box around the text.
    `Style: OvBox,${style.fontFamily},60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,22,0,5,0,0,0,1`,
    // Overlay (glyph): outlined text for emoji reactions & arrow pointers.
    `Style: OvText,${style.fontFamily},60,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,6,5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];

  if (banner.enabled && banner.text.trim()) {
    events.push(
      `Dialogue: 0,${assTime(0)},${assTime(outEnd)},Banner,,0,0,0,,${escapeAss(banner.text.trim())}`,
    );
  }

  // Progress bar: a dim full-width track plus a fill rectangle whose
  // horizontal scale animates 0→100% over the clip via \t (reliable in
  // libass, unlike ffmpeg drawbox time exprs).
  const pb = opts.progressBar;
  if (pb?.enabled && outEnd > 0.1) {
    const barH = Math.max(2, Math.round(pb.thickness * PLAY_H));
    const y = PLAY_H - barH;
    const rect = `m 0 0 l ${PLAY_W} 0 l ${PLAY_W} ${barH} 0 ${barH}`;
    const ms = Math.round(outEnd * 1000);
    events.push(
      // track
      `Dialogue: 0,${assTime(0)},${assTime(outEnd)},Progress,,0,0,0,,{\\an7\\pos(0,${y})\\1c${assColor("#000000")}\\1a&H80&\\bord0\\shad0\\p1}${rect}`,
      // animated fill
      `Dialogue: 0,${assTime(0)},${assTime(outEnd)},Progress,,0,0,0,,{\\an7\\pos(0,${y})\\1c${assColor(pb.color)}\\bord0\\shad0\\fscx0\\t(0,${ms},\\fscx100)\\p1}${rect}`,
    );
  }

  // Motion-graphic overlays. Each pops + fades in at its center; source-time
  // windows are mapped onto the output timeline like captions.
  for (const ov of opts.overlays ?? []) {
    const s = Math.max(ov.start, clipStart);
    const e = Math.min(ov.end, clipEnd);
    if (e <= s) continue;
    const evStart = map(s);
    const evEnd = map(e);
    if (evEnd <= evStart + 0.05) continue;
    const px = Math.round(ov.x * PLAY_W);
    const py = Math.round(ov.y * PLAY_H);
    const durMs = Math.round((evEnd - evStart) * 1000);
    // Scale pop: shoot slightly past 100% then settle.
    const pop = "\\fscx60\\fscy60\\t(0,140,\\fscx110\\fscy110)\\t(140,240,\\fscx100\\fscy100)";

    if (ov.kind === "emoji") {
      const fs = Math.max(24, Math.round(ov.scale * PLAY_W * 0.5));
      const rise = Math.round(PLAY_H * 0.1);
      // Floats upward across its window and fades at the tail.
      const tag = `{\\an5\\move(${px},${py},${px},${py - rise},0,${durMs})\\fs${fs}\\fad(120,220)\\bord${Math.max(2, Math.round(fs * 0.04))}}`;
      events.push(
        `Dialogue: 4,${assTime(evStart)},${assTime(evEnd)},OvText,,0,0,0,,${tag}${escapeAss(ov.text || "🔥")}`,
      );
      continue;
    }

    if (ov.kind === "arrow") {
      const fs = Math.max(24, Math.round(ov.scale * PLAY_W * 0.3));
      // \frz is counter-clockwise, so negate to make `rotation` clockwise.
      const rot = ov.rotation ? `\\frz${(-ov.rotation).toFixed(1)}` : "";
      const tag = `{\\an5\\pos(${px},${py})${rot}\\fs${fs}\\1c${assColor(ov.color)}\\fad(120,120)${pop}}`;
      events.push(
        `Dialogue: 4,${assTime(evStart)},${assTime(evEnd)},OvText,,0,0,0,,${tag}${escapeAss(ov.text || "➜")}`,
      );
      continue;
    }

    // notification / subscribe: opaque box (card / pill).
    const fs = Math.max(
      18,
      Math.round(ov.scale * PLAY_W * (ov.kind === "subscribe" ? 0.09 : 0.07)),
    );
    const boxColor = assColor(ov.color);
    if (ov.kind === "subscribe") {
      const tag = `{\\an5\\pos(${px},${py})\\fs${fs}\\b1\\3c${boxColor}\\4c${boxColor}\\1c${assColor("#ffffff")}\\fad(120,120)${pop}}`;
      events.push(
        `Dialogue: 4,${assTime(evStart)},${assTime(evEnd)},OvBox,,0,0,0,,${tag}${escapeAss((ov.text || "SUBSCRIBE").toUpperCase())}`,
      );
      continue;
    }
    // notification card: bold title, optional lighter body on a 2nd line.
    const title = escapeAss(ov.text || "New comment");
    const body = ov.subtext.trim()
      ? `\\N{\\b0\\fs${Math.round(fs * 0.82)}}${escapeAss(ov.subtext.trim())}`
      : "";
    const tag = `{\\an5\\pos(${px},${py})\\fs${fs}\\b1\\3c${boxColor}\\4c${boxColor}\\1c${assColor("#ffffff")}\\fad(120,120)${pop}}`;
    events.push(
      `Dialogue: 4,${assTime(evStart)},${assTime(evEnd)},OvBox,,0,0,0,,${tag}${title}${body}`,
    );
  }

  // Entrance animations, mirrored from the preview. Spring easing is faked
  // with chained \t (linear ramps): shrink→overshoot→settle.
  const fadeTag =
    style.animation === "fade" || style.animation === "slide"
      ? "{\\fad(160,0)}"
      : style.animation === "bounce" && !style.karaoke
        ? "{\\fad(70,0)\\fscx40\\fscy40\\t(0,110,\\fscx114\\fscy114)\\t(110,250,\\fscx100\\fscy100)}"
        : style.animation === "pop" && !style.karaoke
          ? "{\\fscx60\\fscy60\\t(0,90,\\fscx112\\fscy112)\\t(90,210,\\fscx100\\fscy100)}"
          : "";
  // Per-word punch on the active karaoke word (pop/bounce): a springy
  // shrink→overshoot→settle each time the word begins.
  const popTag =
    style.karaoke &&
    (style.animation === "pop" || style.animation === "bounce")
      ? "\\fscx55\\fscy55\\t(0,90,\\fscx116\\fscy116)\\t(90,220,\\fscx100\\fscy100)"
      : "";

  const activeColor = assColor(style.activeColor);
  const activeBg = style.activeBgColor ? assColor(style.activeBgColor) : "";
  const accentColor = assColor(style.accentColor);
  const textColor = assColor(style.textColor);
  const reveal = style.animation === "reveal";
  const typewriter = style.animation === "typewriter";

  // Two-tone: base color alternates by word position (white/accent/...).
  const twoToneColor = (idx: number) =>
    idx % 2 === 0 ? textColor : accentColor;

  // Decorate a non-active word: two-tone / keyword coloring + optional emoji.
  const decorate = (w: string, idx: number): string => {
    const base = wordText(w);
    const withEmoji = style.autoEmoji && emojiFor(w) ? `${base} ${emojiFor(w)}` : base;
    if (style.twoTone) {
      return `{\\c${twoToneColor(idx)}}${withEmoji}{\\c${textColor}}`;
    }
    if (style.highlightKeywords && isKeyword(w)) {
      return `{\\c${accentColor}}${withEmoji}{\\c${textColor}}`;
    }
    return withEmoji;
  };
  const wordText = (w: string) =>
    escapeAss(style.uppercase ? w.toUpperCase() : w);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.end <= clipStart || line.start >= clipEnd) continue;

    if (!style.karaoke) {
      // Phrase mode: the whole line as one event, held on screen until
      // the next line starts (capped) — mirrors the preview's hold.
      const next = lines[li + 1];
      const holdUntil = Math.min(
        line.end + 1.5,
        next ? next.start : Infinity,
      );
      const evStart = map(Math.max(line.start, clipStart));
      const evEnd = map(Math.min(Math.max(line.end, holdUntil), clipEnd));
      if (evEnd <= evStart + 0.01) continue;
      const text = line.words.map((w, j) => decorate(w.text, j)).join(" ");
      events.push(
        `Dialogue: 1,${assTime(evStart)},${assTime(evEnd)},Caption,,0,0,0,,${fadeTag}${text}`,
      );
      continue;
    }

    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      // Event covers this word's speaking window; between words the next
      // event takes over, so the line stays continuously on screen.
      const evStart = map(Math.max(word.start, clipStart));
      const evEnd = map(
        i + 1 < line.words.length
          ? Math.min(line.words[i + 1].start, clipEnd)
          : Math.min(line.end, clipEnd),
      );
      if (evEnd <= 0.01 || evEnd <= evStart + 0.005) continue;

      const highlight = activeBg
        ? `{\\c${activeColor}\\3c${activeBg}\\bord${Math.max(outline, Math.round(fontSize * 0.16))}${popTag}}`
        : `{\\c${activeColor}${popTag}}`;
      const activeEmoji =
        style.autoEmoji && emojiFor(word.text) ? ` ${emojiFor(word.text)}` : "";

      // Builds the whole line with a caller-supplied rendering of the active
      // word; preceding words are decorated, following words hidden
      // (reveal / typewriter) or decorated (plain karaoke).
      const composeLine = (activeRender: string): string =>
        line.words
          .map((w, j) => {
            if ((reveal || typewriter) && j > i) return "";
            if (j !== i) return decorate(w.text, j);
            return activeRender;
          })
          .filter((s) => s !== "")
          .join(" ");

      const fullActive = `${highlight}${wordText(word.text)}${activeEmoji}{\\r}`;

      if (!typewriter) {
        events.push(
          `Dialogue: 1,${assTime(evStart)},${assTime(evEnd)},Caption,,0,0,0,,${composeLine(fullActive)}`,
        );
        continue;
      }

      // Typewriter: reveal the active word letter-by-letter across its spoken
      // window, then hold the full word until the next word begins. Hidden
      // tail letters keep the block width/centering stable (\alpha&HFF&).
      const chars = wordText(word.text);
      const len = chars.length;
      const wEndOut = map(Math.min(word.end, clipEnd));
      const revealEnd = Math.min(evEnd, Math.max(wEndOut, evStart));
      if (len <= 1 || revealEnd <= evStart + 0.02) {
        events.push(
          `Dialogue: 1,${assTime(evStart)},${assTime(evEnd)},Caption,,0,0,0,,${composeLine(fullActive)}`,
        );
        continue;
      }
      const span = revealEnd - evStart;
      for (let k = 1; k <= len; k++) {
        const t0 = evStart + (span * (k - 1)) / len;
        const t1 = k === len ? revealEnd : evStart + (span * k) / len;
        if (t1 <= t0 + 0.005) continue;
        const typed = chars.slice(0, k);
        const rest = chars.slice(k);
        const active =
          `${highlight}${typed}` +
          (rest ? `{\\alpha&HFF&}${rest}` : "") +
          `${activeEmoji}{\\r}`;
        events.push(
          `Dialogue: 1,${assTime(t0)},${assTime(t1)},Caption,,0,0,0,,${composeLine(active)}`,
        );
      }
      // Hold the fully-typed word for the remainder of the window.
      if (evEnd > revealEnd + 0.02) {
        events.push(
          `Dialogue: 1,${assTime(revealEnd)},${assTime(evEnd)},Caption,,0,0,0,,${composeLine(fullActive)}`,
        );
      }
    }
  }

  return [...header, ...events, ""].join("\n");
}
