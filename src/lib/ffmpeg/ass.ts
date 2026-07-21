import type {
  CaptionLine,
  CaptionStyle,
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

  // Entrance animations, mirrored from the preview. fade/slide/bounce all
  // burn in as a fade-in (slide/bounce add motion only in the live
  // preview); pop scales the highlighted word.
  const fadeTag =
    style.animation === "fade" ||
    style.animation === "slide" ||
    style.animation === "bounce"
      ? "{\\fad(140,0)}"
      : "";
  const popTag =
    style.animation === "pop" ? "\\fscx112\\fscy112\\t(0,120,\\fscx100\\fscy100)" : "";

  const activeColor = assColor(style.activeColor);
  const activeBg = style.activeBgColor ? assColor(style.activeBgColor) : "";
  const accentColor = assColor(style.accentColor);
  const reveal = style.animation === "reveal";

  // Decorate a non-active word: keyword coloring + optional emoji.
  const decorate = (w: string): string => {
    const base = wordText(w);
    const withEmoji = style.autoEmoji && emojiFor(w) ? `${base} ${emojiFor(w)}` : base;
    if (style.highlightKeywords && isKeyword(w)) {
      return `{\\c${accentColor}}${withEmoji}{\\c${assColor(style.textColor)}}`;
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
      const text = line.words.map((w) => decorate(w.text)).join(" ");
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

      const rendered = line.words
        .map((w, j) => {
          // "reveal": only render words spoken so far.
          if (reveal && j > i) return "";
          if (j !== i) return decorate(w.text);
          const highlight = activeBg
            ? `{\\c${activeColor}\\3c${activeBg}\\bord${Math.max(outline, Math.round(fontSize * 0.16))}${popTag}}`
            : `{\\c${activeColor}${popTag}}`;
          const activeEmoji =
            style.autoEmoji && emojiFor(w.text) ? ` ${emojiFor(w.text)}` : "";
          return `${highlight}${wordText(w.text)}${activeEmoji}{\\r}`;
        })
        .filter((s) => s !== "")
        .join(" ");

      events.push(
        `Dialogue: 1,${assTime(evStart)},${assTime(evEnd)},Caption,,0,0,0,,${rendered}`,
      );
    }
  }

  return [...header, ...events, ""].join("\n");
}
