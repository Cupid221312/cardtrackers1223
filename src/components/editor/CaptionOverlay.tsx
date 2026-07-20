"use client";

import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import { activeLineAt, activeWordIndex } from "@/services/ai/captions";

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

  const line = activeLineAt(lines, currentTime);
  if (!line) return null;
  // Outside the selected clip the captions are not part of the deliverable.
  if (clip && (currentTime < clip.start - 0.05 || currentTime > clip.end + 0.05)) {
    return null;
  }

  const activeIdx = activeWordIndex(line, currentTime);
  const fontPx = Math.max(10, style.fontSize * canvasHeight);
  const strokePx = style.strokeWidth * fontPx;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-[6%]"
      style={{ top: `${style.verticalPosition * 100}%` }}
    >
      <div
        className="flex max-w-full flex-wrap items-center justify-center gap-x-[0.32em] text-center leading-tight"
        style={{
          fontFamily: `"${style.fontFamily}", "Arial Black", Impact, sans-serif`,
          fontSize: fontPx,
          fontWeight: 800,
        }}
      >
        {line.words.map((word, i) => {
          const isActive = i === activeIdx;
          const color = isActive ? style.activeColor : style.textColor;
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
                transform: isActive ? "scale(1.08)" : "scale(1)",
              }}
            >
              {style.uppercase ? word.text.toUpperCase() : word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
