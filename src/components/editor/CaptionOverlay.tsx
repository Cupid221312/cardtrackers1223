"use client";

import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import { activeLineAt, activeWordIndex } from "@/services/ai/captions";
import { emojiFor, isKeyword } from "@/services/ai/captionDecor";
import clsx from "clsx";

/**
 * Karaoke-style caption renderer. Shows the caption line being spoken at the
 * playhead and highlights the active word, mirroring the ASS output the
 * export pipeline generates so preview === render.
 */
export default function CaptionOverlay({
  canvasHeight,
}: {
  canvasHeight: number;
}) {
  const lines = useEditorStore((s) => s.captionLines);
  const style = useEditorStore((s) => s.captionStyle);
  const currentTime = useEditorStore((s) => s.currentTime);
  const clip = useSelectedClip();

  // Phrase mode holds finished lines on screen so text never flickers off
  // between sentences (Reels style); karaoke mode tracks speech exactly.
  const line = activeLineAt(lines, currentTime, style.karaoke ? 0 : 1.5);
  if (!line) return null;
  // Outside the selected clip the captions are not part of the deliverable.
  if (clip && (currentTime < clip.start - 0.05 || currentTime > clip.end + 0.05)) {
    return null;
  }

  const activeIdx = style.karaoke ? activeWordIndex(line, currentTime) : -1;
  const fontPx = Math.max(10, style.fontSize * canvasHeight);
  const strokePx = style.strokeWidth * fontPx;
  const fontFallbacks = style.karaoke
    ? '"Arial Black", Impact, sans-serif'
    : "-apple-system, 'Helvetica Neue', sans-serif";

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-[6%]"
      style={{ top: `${style.verticalPosition * 100}%` }}
    >
      <div
        key={line.id}
        className={clsx(
          "flex max-w-[82%] flex-wrap items-center justify-center gap-x-[0.28em] text-center leading-snug",
          style.animation === "fade" && "caption-anim-fade",
          style.animation === "pop" && !style.karaoke && "caption-anim-pop",
          style.animation === "slide" && "caption-anim-slide",
          style.animation === "bounce" && "caption-anim-bounce",
        )}
        style={{
          fontFamily: `"${style.fontFamily}", ${fontFallbacks}`,
          fontSize: fontPx,
          fontWeight: style.fontWeight,
          backgroundColor: style.boxColor || undefined,
          borderRadius: style.boxColor ? fontPx * 0.28 : undefined,
          padding: style.boxColor
            ? `${fontPx * 0.18}px ${fontPx * 0.42}px`
            : undefined,
        }}
      >
        {line.words.map((word, i) => {
          // "reveal"/"typewriter": only show words spoken so far (karaoke).
          if (
            (style.animation === "reveal" || style.animation === "typewriter") &&
            style.karaoke &&
            i > activeIdx
          ) {
            return null;
          }
          const isActive = i === activeIdx;
          const keyword = style.highlightKeywords && isKeyword(word.text);
          // Two-tone: alternate base color by word position (e.g. white/green).
          const baseColor = style.twoTone
            ? i % 2 === 0
              ? style.textColor
              : style.accentColor
            : keyword
              ? style.accentColor
              : style.textColor;
          const color = isActive ? style.activeColor : baseColor;
          const emoji = style.autoEmoji ? emojiFor(word.text) : "";
          // Typewriter: reveal the active word letter-by-letter over its
          // spoken window; already-spoken words stay whole.
          let typedCount = -1;
          if (style.animation === "typewriter" && style.karaoke && isActive) {
            const dur = Math.max(0.001, word.end - word.start);
            const frac = Math.min(1, Math.max(0, (currentTime - word.start) / dur));
            typedCount = Math.max(1, Math.ceil(frac * word.text.length));
          }
          const shadowParts: string[] = [];
          if (strokePx > 0 && style.strokeColor) {
            // Multi-direction shadow fakes a heavy stroke more cleanly than
            // -webkit-text-stroke at large sizes.
            const r = Math.max(1, strokePx);
            shadowParts.push(
              `${r}px ${r}px 0 ${style.strokeColor}`,
              `-${r}px ${r}px 0 ${style.strokeColor}`,
              `${r}px -${r}px 0 ${style.strokeColor}`,
              `-${r}px -${r}px 0 ${style.strokeColor}`,
              `0 ${r}px 0 ${style.strokeColor}`,
              `0 -${r}px 0 ${style.strokeColor}`,
              `${r}px 0 0 ${style.strokeColor}`,
              `-${r}px 0 0 ${style.strokeColor}`,
            );
          }
          if (style.shadow) {
            shadowParts.push(`0 ${fontPx * 0.08}px ${fontPx * 0.2}px rgba(0,0,0,0.7)`);
          }
          return (
            <span
              key={word.id}
              className="inline-block transition-transform duration-75"
              style={{
                color,
                textShadow: shadowParts.join(", ") || undefined,
                backgroundColor:
                  isActive && style.activeBgColor
                    ? style.activeBgColor
                    : undefined,
                borderRadius: isActive && style.activeBgColor ? fontPx * 0.18 : 0,
                padding:
                  isActive && style.activeBgColor
                    ? `0 ${fontPx * 0.18}px`
                    : undefined,
                transform:
                  isActive && style.animation === "pop"
                    ? "scale(1.08)"
                    : "scale(1)",
              }}
            >
              {typedCount >= 0
                ? (() => {
                    const full = style.uppercase
                      ? word.text.toUpperCase()
                      : word.text;
                    return (
                      <>
                        {full.slice(0, typedCount)}
                        <span style={{ visibility: "hidden" }}>
                          {full.slice(typedCount)}
                        </span>
                      </>
                    );
                  })()
                : style.uppercase
                  ? word.text.toUpperCase()
                  : word.text}
              {emoji ? ` ${emoji}` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
