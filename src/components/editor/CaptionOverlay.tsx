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
          // Crisp outline via paint-order stroke (matches libass), plus a soft
          // drop shadow for depth so text reads on any background.
          const hasStroke = strokePx > 0 && !!style.strokeColor;
          const dropShadow = style.shadow
            ? `0 ${Math.round(fontPx * 0.06)}px ${Math.round(fontPx * 0.14)}px rgba(0,0,0,0.55)`
            : undefined;
          const hasChip = isActive && !!style.activeBgColor;
          // Per-word "punch": the active karaoke word springs each time it
          // changes. Keying on active state remounts the span so the CSS
          // animation replays for every new word (not just the first).
          const springWord =
            isActive &&
            style.karaoke &&
            (style.animation === "pop" || style.animation === "bounce");
          return (
            <span
              key={`${word.id}-${isActive}`}
              className={clsx(
                "inline-block transition-transform duration-100",
                springWord && "caption-word-pop",
              )}
              style={{
                color,
                WebkitTextStrokeWidth: hasStroke ? `${strokePx}px` : undefined,
                WebkitTextStrokeColor: hasStroke ? style.strokeColor : undefined,
                paintOrder: "stroke fill",
                textShadow: dropShadow,
                backgroundColor: hasChip ? style.activeBgColor : undefined,
                borderRadius: hasChip ? fontPx * 0.22 : 0,
                padding: hasChip ? `${fontPx * 0.02}px ${fontPx * 0.22}px` : undefined,
                boxShadow: hasChip
                  ? `0 ${Math.round(fontPx * 0.05)}px ${Math.round(fontPx * 0.12)}px rgba(0,0,0,0.35)`
                  : undefined,
                transform: springWord
                  ? undefined
                  : isActive && !style.karaoke && style.animation === "pop"
                    ? "scale(1.06)"
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
