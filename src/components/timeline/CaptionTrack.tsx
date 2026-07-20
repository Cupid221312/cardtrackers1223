"use client";

import { useEditorStore } from "@/lib/store/editorStore";
import TrackShell from "@/components/timeline/TrackShell";
import clsx from "clsx";

/**
 * Independent text/caption track. Each block is one caption line; drag a
 * block horizontally to retime the line (its words shift with it), click
 * to jump the playhead there.
 */
export default function CaptionTrack({ labelWidth }: { labelWidth: number }) {
  const lines = useEditorStore((s) => s.captionLines);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const currentTime = useEditorStore((s) => s.currentTime);

  function dragLine(e: React.PointerEvent, lineId: string) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const pps = useEditorStore.getState().pxPerSec;
    let applied = 0;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pps;
      const step = dt - applied;
      if (Math.abs(step) < 0.03) return;
      moved = true;
      // Line ids are rebuilt after each shift; re-resolve by overlap of the
      // originally grabbed id, which stays stable while only times change.
      const s = useEditorStore.getState();
      const line = s.captionLines.find((l) => l.id === lineId);
      if (!line) return;
      s.shiftCaptionLine(lineId, step);
      applied = dt;
      // ids can change after regroup; track the nearest line at same words
      const after = useEditorStore.getState().captionLines;
      const match = after.find(
        (l) => l.words[0]?.id === line.words[0]?.id,
      );
      if (match) lineId = match.id;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) {
        const s = useEditorStore.getState();
        const line = s.captionLines.find((l) => l.id === lineId);
        if (line) s.seekTo(line.start);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <TrackShell label="Text" color="#ffd400" labelWidth={labelWidth} height={40}>
      {lines.map((line) => {
        const active = currentTime >= line.start && currentTime <= line.end;
        return (
          <div
            key={line.id}
            className={clsx(
              "absolute inset-y-1.5 z-10 cursor-grab overflow-hidden rounded border px-1 active:cursor-grabbing",
              active
                ? "border-brand-yellow bg-brand-yellow/25"
                : "border-brand-yellow/30 bg-brand-yellow/10 hover:bg-brand-yellow/20",
            )}
            style={{
              left: line.start * pxPerSec,
              width: Math.max(6, (line.end - line.start) * pxPerSec),
            }}
            onPointerDown={(e) => dragLine(e, line.id)}
            title={line.words.map((w) => w.text).join(" ")}
          >
            <span className="pointer-events-none block truncate text-[9px] leading-[22px] text-brand-yellow/90">
              {line.words.map((w) => w.text).join(" ")}
            </span>
          </div>
        );
      })}
    </TrackShell>
  );
}
