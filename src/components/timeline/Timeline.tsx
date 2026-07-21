"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import TimeRuler from "@/components/timeline/TimeRuler";
import VideoTrack from "@/components/timeline/VideoTrack";
import AudioTrack from "@/components/timeline/AudioTrack";
import CaptionTrack from "@/components/timeline/CaptionTrack";
import { clamp, formatTimecode } from "@/lib/time";

const TRACK_LABEL_WIDTH = 76;

/**
 * Multi-track timeline: ruler + video / audio / caption tracks sharing one
 * horizontal px-per-second scale, with a draggable playhead spanning all
 * tracks. Scrub anywhere; drag clip edges to trim; drag caption blocks to
 * retime lines.
 */
export default function Timeline() {
  const source = useEditorStore((s) => s.source);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const currentTime = useEditorStore((s) => s.currentTime);
  const playing = useEditorStore((s) => s.playing);
  const clip = useSelectedClip();
  const scrollRef = useRef<HTMLDivElement>(null);

  const duration = source?.duration ?? 0;
  const contentWidth = Math.max(200, duration * pxPerSec);
  const [detectingScenes, setDetectingScenes] = useState(false);

  const splitAtScenes = useCallback(async () => {
    const s = useEditorStore.getState();
    const c = s.clips.find((cl) => cl.id === s.selectedClipId);
    if (!s.source || !c) return;
    setDetectingScenes(true);
    try {
      const res = await fetch(`/api/media/${s.source.mediaId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: c.start, end: c.end, threshold: 0.4 }),
      });
      const body = await res.json();
      if (res.ok && Array.isArray(body.cuts) && body.cuts.length > 0) {
        // Cuts are clip-relative; convert to source time.
        s.splitClipAtTimes(c.id, body.cuts.map((t: number) => c.start + t));
      }
    } catch {
      // best-effort; leave the clip as-is on failure
    } finally {
      setDetectingScenes(false);
    }
  }, []);

  // Follow the playhead during playback (only then, so manual browsing
  // never fights the auto-scroll).
  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = TRACK_LABEL_WIDTH + currentTime * pxPerSec;
    const viewLeft = el.scrollLeft + TRACK_LABEL_WIDTH;
    const viewRight = el.scrollLeft + el.clientWidth - 60;
    if (playheadX < viewLeft || playheadX > viewRight) {
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth * 0.3);
    }
  }, [currentTime, playing, pxPerSec]);

  const timeFromEvent = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft - TRACK_LABEL_WIDTH;
      return clamp(x / useEditorStore.getState().pxPerSec, 0, duration);
    },
    [duration],
  );

  const startScrub = useCallback(
    (e: React.PointerEvent) => {
      if (!source) return;
      e.preventDefault();
      const seek = (clientX: number) =>
        useEditorStore.getState().seekTo(timeFromEvent(clientX));
      seek(e.clientX);
      const onMove = (ev: PointerEvent) => seek(ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [source, timeFromEvent],
  );

  return (
    <div className="flex h-full flex-col">
      {/* ---- toolbar ------------------------------------------------------ */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-ink-700 px-3">
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-[0.14em]">
            Timeline
          </span>
          <span className="tabular-nums text-slate-400">
            {formatTimecode(currentTime)}
          </span>
          {clip && (
            <span className="text-slate-500">
              Clip length:{" "}
              <span className="tabular-nums text-slate-300">
                {(clip.end - clip.start).toFixed(1)}s
              </span>
            </span>
          )}
          <span className="h-3.5 w-px bg-ink-600" />
          <button
            className="rounded px-1.5 py-0.5 font-medium text-slate-300 transition hover:bg-ink-700 disabled:opacity-40"
            onClick={() => useEditorStore.getState().addManualClip()}
            disabled={!source}
            title="New clip window at the playhead"
          >
            + Clip
          </button>
          <button
            className="rounded px-1.5 py-0.5 font-medium text-slate-300 transition hover:bg-ink-700 disabled:opacity-40"
            onClick={() => {
              const s = useEditorStore.getState();
              if (s.selectedClipId) s.splitClip(s.selectedClipId, s.currentTime);
            }}
            disabled={
              !clip || currentTime < clip.start + 3 || currentTime > clip.end - 3
            }
            title="Split the selected clip at the playhead (S)"
          >
            ✂ Split
          </button>
          <button
            className="rounded px-1.5 py-0.5 font-medium text-slate-300 transition hover:bg-ink-700 disabled:opacity-40"
            onClick={splitAtScenes}
            disabled={!clip || !source || detectingScenes}
            title="Detect hard cuts in the clip and split on them"
          >
            {detectingScenes ? "Detecting…" : "⧉ Split at scenes"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-600">
            Zoom
          </span>
          <input
            type="range"
            className="slider !w-28"
            min={2}
            max={80}
            step={1}
            value={pxPerSec}
            onChange={(e) =>
              useEditorStore.getState().setPxPerSec(Number(e.target.value))
            }
          />
        </div>
      </div>

      {/* ---- tracks ------------------------------------------------------- */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div
          className="relative flex min-h-full flex-col"
          style={{ width: contentWidth + TRACK_LABEL_WIDTH + 40 }}
        >
          <TimeRuler
            duration={duration}
            pxPerSec={pxPerSec}
            labelWidth={TRACK_LABEL_WIDTH}
            onScrubStart={startScrub}
          />
          <VideoTrack labelWidth={TRACK_LABEL_WIDTH} onScrubStart={startScrub} />
          <AudioTrack labelWidth={TRACK_LABEL_WIDTH} onScrubStart={startScrub} />
          <CaptionTrack labelWidth={TRACK_LABEL_WIDTH} />

          {/* playhead spanning all tracks */}
          {source && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-brand-red"
              style={{ left: TRACK_LABEL_WIDTH + currentTime * pxPerSec }}
            >
              <div className="absolute -left-[5px] -top-0 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-brand-red" />
            </div>
          )}
        </div>
        {!source && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
            The timeline lights up once media is imported.
          </div>
        )}
      </div>
    </div>
  );
}
