"use client";

import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";

/** Bottom progress bar that fills across the selected clip (retention aid). */
export default function ProgressBarOverlay({
  canvasHeight,
}: {
  canvasHeight: number;
}) {
  const bar = useEditorStore((s) => s.progressBar);
  const currentTime = useEditorStore((s) => s.currentTime);
  const clip = useSelectedClip();
  if (!bar.enabled) return null;

  const start = clip?.start ?? 0;
  const end = clip?.end ?? useEditorStore.getState().source?.duration ?? 1;
  const pct = Math.min(1, Math.max(0, (currentTime - start) / Math.max(0.1, end - start)));

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
      style={{ height: Math.max(2, bar.thickness * canvasHeight) }}
    >
      <div className="h-full w-full bg-black/30" />
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${pct * 100}%`, backgroundColor: bar.color }}
      />
    </div>
  );
}
