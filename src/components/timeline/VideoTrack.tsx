"use client";

import {
  useEditorStore,
  useSelectedClipKeyframes,
} from "@/lib/store/editorStore";
import TrackShell from "@/components/timeline/TrackShell";
import { clamp } from "@/lib/time";
import clsx from "clsx";

/**
 * Video track: the full source shown as a dim strip, detected clips as
 * blocks. The selected clip gets drag handles on both edges for trimming
 * and can be dragged in the middle to slide the whole window.
 */
export default function VideoTrack({
  labelWidth,
  onScrubStart,
}: {
  labelWidth: number;
  onScrubStart: (e: React.PointerEvent) => void;
}) {
  const source = useEditorStore((s) => s.source);
  const clips = useEditorStore((s) => s.clips);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const selectedKeyframes = useSelectedClipKeyframes();

  const duration = source?.duration ?? 0;

  function dragEdge(
    e: React.PointerEvent,
    clipId: string,
    mode: "start" | "end" | "move",
  ) {
    e.preventDefault();
    e.stopPropagation();
    const state = useEditorStore.getState();
    const clip = state.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const startX = e.clientX;
    const orig = { start: clip.start, end: clip.end };
    const pps = state.pxPerSec;

    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - startX) / pps;
      const s = useEditorStore.getState();
      if (mode === "start") {
        s.setClipRange(
          clipId,
          clamp(orig.start + dt, 0, orig.end - 3),
          orig.end,
        );
      } else if (mode === "end") {
        s.setClipRange(
          clipId,
          orig.start,
          clamp(orig.end + dt, orig.start + 3, duration),
        );
      } else {
        const len = orig.end - orig.start;
        const ns = clamp(orig.start + dt, 0, duration - len);
        s.setClipRange(clipId, ns, ns + len);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <TrackShell
      label="Video"
      color="#7c5cff"
      labelWidth={labelWidth}
      onScrubStart={onScrubStart}
      height={52}
    >
      {source && (
        <div
          className="absolute inset-y-2 overflow-hidden rounded-md bg-gradient-to-r from-ink-700 to-ink-600"
          style={{
            left: 0,
            width: duration * pxPerSec,
            // Real filmstrip sprite (20 frames tiled server-side); the
            // gradient behind it shows until the strip loads.
            backgroundImage: `url(/api/media/${source.mediaId}/thumbs), linear-gradient(to right, #1e2330, #2a3040)`,
            backgroundSize: "100% 100%",
            opacity: 0.85,
          }}
        />
      )}

      {clips.map((clip) => {
        const selected = clip.id === selectedClipId;
        return (
          <div
            key={clip.id}
            className={clsx(
              "group absolute inset-y-1 z-10 rounded-md border transition-colors",
              selected
                ? "cursor-grab border-accent bg-accent/30 shadow-glow active:cursor-grabbing"
                : "cursor-pointer border-ink-500 bg-ink-600/70 hover:border-accent/50",
            )}
            style={{
              left: clip.start * pxPerSec,
              width: Math.max(8, (clip.end - clip.start) * pxPerSec),
            }}
            onPointerDown={(e) => {
              if (selected) {
                dragEdge(e, clip.id, "move");
              } else {
                e.stopPropagation();
                useEditorStore.getState().selectClip(clip.id);
              }
            }}
          >
            <span className="pointer-events-none absolute inset-x-1.5 top-1 truncate text-[10px] font-semibold text-white/90">
              {clip.title}
            </span>
            {selected && (
              <>
                {/* zoom/pan keyframe markers */}
                {selectedKeyframes.map((kf) => (
                  <div
                    key={kf.id}
                    className="pointer-events-none absolute bottom-1 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand-yellow shadow"
                    style={{ left: kf.time * pxPerSec }}
                    title={`${kf.zoom.toFixed(2)}× @ ${kf.time.toFixed(1)}s`}
                  />
                ))}
                <TrimHandle
                  side="left"
                  onPointerDown={(e) => dragEdge(e, clip.id, "start")}
                />
                <TrimHandle
                  side="right"
                  onPointerDown={(e) => dragEdge(e, clip.id, "end")}
                />
              </>
            )}
          </div>
        );
      })}
    </TrackShell>
  );
}

function TrimHandle({
  side,
  onPointerDown,
}: {
  side: "left" | "right";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={clsx(
        "absolute inset-y-0 z-20 flex w-2.5 cursor-ew-resize items-center justify-center rounded-sm bg-accent",
        side === "left" ? "-left-[1px]" : "-right-[1px]",
      )}
      onPointerDown={onPointerDown}
    >
      <div className="h-3.5 w-0.5 rounded bg-white/80" />
    </div>
  );
}
