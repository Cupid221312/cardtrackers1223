"use client";

import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import type { GraphicOverlay } from "@/lib/types";
import clsx from "clsx";

/**
 * Motion-graphic overlay renderer (preview). Shows timed graphics during
 * playback: notification cards, subscribe pills, emoji floats, arrows.
 */
export default function OverlayLayer({
  canvasHeight,
  canvasWidth,
}: {
  canvasHeight: number;
  canvasWidth: number;
}) {
  const overlays = useEditorStore((s) => s.overlays);
  const currentTime = useEditorStore((s) => s.currentTime);
  const clip = useSelectedClip();

  const active = overlays.filter(
    (ov) =>
      currentTime >= ov.start &&
      currentTime < ov.end &&
      (!clip || (currentTime >= clip.start && currentTime <= clip.end)),
  );

  if (active.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {active.map((ov) => (
        <OverlayItem
          key={ov.id}
          overlay={ov}
          canvasHeight={canvasHeight}
          canvasWidth={canvasWidth}
        />
      ))}
    </div>
  );
}

function OverlayItem({
  overlay: ov,
  canvasHeight,
  canvasWidth,
}: {
  overlay: GraphicOverlay;
  canvasHeight: number;
  canvasWidth: number;
}) {
  const px = Math.round(ov.x * canvasWidth);
  const py = Math.round(ov.y * canvasHeight);
  const size = ov.scale * canvasWidth;

  if (ov.kind === "emoji") {
    const fs = Math.max(24, size * 0.5);
    return (
      <div
        className="absolute animate-float"
        style={{
          left: px,
          top: py,
          transform: "translate(-50%, -50%)",
          fontSize: fs,
          opacity: 0.9,
        }}
      >
        {ov.text || "🔥"}
      </div>
    );
  }

  if (ov.kind === "arrow") {
    const fs = Math.max(24, size * 0.3);
    return (
      <div
        className="absolute animate-pop"
        style={{
          left: px,
          top: py,
          transform: `translate(-50%, -50%) rotate(${ov.rotation || 0}deg)`,
          fontSize: fs,
          color: ov.color,
          fontWeight: "bold",
        }}
      >
        {ov.text || "➜"}
      </div>
    );
  }

  // notification / subscribe: box container.
  const isSubscribe = ov.kind === "subscribe";
  const fontSize = isSubscribe ? size * 0.09 : size * 0.07;

  return (
    <div
      className={clsx(
        "absolute flex items-center justify-center rounded-full animate-pop",
        isSubscribe ? "px-5 py-2 rounded-full" : "px-3 py-2.5 rounded-lg",
      )}
      style={{
        left: px,
        top: py,
        transform: "translate(-50%, -50%)",
        backgroundColor: ov.color,
        color: "#ffffff",
        fontSize,
        fontWeight: "bold",
        minWidth: isSubscribe ? "auto" : size * 0.8,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <div>
        <div>{ov.text}</div>
        {ov.subtext && ov.kind === "notification" && (
          <div style={{ fontSize: fontSize * 0.75, fontWeight: "normal" }}>
            {ov.subtext}
          </div>
        )}
      </div>
    </div>
  );
}
