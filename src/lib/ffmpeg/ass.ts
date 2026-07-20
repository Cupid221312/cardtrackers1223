import type { CaptionLine, CaptionStyle, HookBanner } from "@/lib/types";

/**
 * Generates an .ass subtitle file that reproduces the preview's karaoke
 * captions and hook banner at 1080x1920. Word-level highlighting is done
 * with one Dialogue event per word (whole line rendered, active word
 * recolored inline) — exact and renderer-agnostic, unlike \k karaoke fill.
 */

const PLAY_W = 1080;
const PLAY_H = 1920;

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
}): string {
  const { lines, style, banner, clipStart, clipEnd } = opts;

  const fontSize = Math.round(style.fontSize * PLAY_H);
  const outline = Math.max(0, Math.round(style.strokeWidth * fontSize * 0.45));
  const shadow = style.shadow ? Math.max(1, Math.round(fontSize * 0.07)) : 0;
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
    `Style: Caption,${style.fontFamily},${fontSize},${assColor(style.textColor)},${assColor(style.textColor)},${assColor(style.strokeColor || "#000000")},${assColor("#000000", 0.4)},-1,0,0,0,100,100,1,0,1,${outline},${shadow},2,60,60,${Math.max(0, captionMarginV)},1`,
    // Banner style: alignment 8 = top-center, BorderStyle 4 = background box.
    `Style: Banner,${style.fontFamily},${bannerFontSize},${assColor(banner.textColor)},${assColor(banner.textColor)},${assColor(banner.bgColor)},${assColor(banner.bgColor)},-1,0,0,0,100,100,1,0,4,${Math.round(bannerFontSize * 0.3)},0,8,70,70,${bannerMarginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];

  if (banner.enabled && banner.text.trim()) {
    events.push(
      `Dialogue: 0,${assTime(0)},${assTime(clipEnd - clipStart)},Banner,,0,0,0,,${escapeAss(banner.text.trim())}`,
    );
  }

  const activeColor = assColor(style.activeColor);
  const activeBg = style.activeBgColor ? assColor(style.activeBgColor) : "";

  for (const line of lines) {
    if (line.end <= clipStart || line.start >= clipEnd) continue;
    const wordsText = (w: string) =>
      escapeAss(style.uppercase ? w.toUpperCase() : w);

    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      // Event covers this word's speaking window; between words the next
      // event takes over, so the line stays continuously on screen.
      const evStart = Math.max(word.start, clipStart) - clipStart;
      const evEnd =
        (i + 1 < line.words.length
          ? Math.min(line.words[i + 1].start, clipEnd)
          : Math.min(line.end, clipEnd)) - clipStart;
      if (evEnd <= 0 || evEnd <= evStart) continue;

      const rendered = line.words
        .map((w, j) => {
          if (j !== i) return wordsText(w.text);
          const highlight = activeBg
            ? `{\\c${activeColor}\\3c${activeBg}\\bord${Math.max(outline, Math.round(fontSize * 0.16))}}`
            : `{\\c${activeColor}}`;
          return `${highlight}${wordsText(w.text)}{\\r}`;
        })
        .join(" ");

      events.push(
        `Dialogue: 1,${assTime(evStart)},${assTime(evEnd)},Caption,,0,0,0,,${rendered}`,
      );
    }
  }

  return [...header, ...events, ""].join("\n");
}
