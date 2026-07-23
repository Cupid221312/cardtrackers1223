"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { GradeChips, scoreColor } from "@/components/editor/RatingBadges";
import type { ClipCandidate } from "@/lib/types";
import { formatTimecode } from "@/lib/time";
import clsx from "clsx";

/**
 * Full-screen results gallery: every detected clip laid out as a ranked,
 * rated, hover-to-preview card (Opus-style). Pick one to edit or export.
 */
export default function ClipsGallery() {
  const open = useEditorStore((s) => s.galleryOpen);
  const clips = useEditorStore((s) => s.clips);
  const mediaId = useEditorStore((s) => s.source?.mediaId ?? "");
  const setGalleryOpen = useEditorStore((s) => s.setGalleryOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setGalleryOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setGalleryOpen]);

  if (!open) return null;

  const avg =
    clips.length > 0
      ? Math.round(clips.reduce((n, c) => n + c.score, 0) / clips.length)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-700 px-5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-bold text-white">
            {clips.length} clip{clips.length === 1 ? "" : "s"} found
          </h2>
          <span className="text-xs text-slate-400">
            ranked by AI virality score · avg{" "}
            <span className={clsx("font-bold", scoreColor(avg))}>{avg}</span>
          </span>
        </div>
        <button
          className="btn-ghost !py-1.5 text-xs"
          onClick={() => setGalleryOpen(false)}
        >
          ✕ Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {clips.length === 0 ? (
          <div className="mx-auto mt-20 max-w-sm text-center">
            <p className="text-sm text-slate-400">No clips yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Import a video and hit <b>Find Viral Clips</b>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {clips.map((clip, i) => (
              <ClipCard key={clip.id} clip={clip} rank={i + 1} mediaId={mediaId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  rank,
  mediaId,
}: {
  clip: ClipCandidate;
  rank: number;
  mediaId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectClip = useEditorStore((s) => s.selectClip);
  const setGalleryOpen = useEditorStore((s) => s.setGalleryOpen);
  const setDetailClip = useEditorStore((s) => s.setDetailClip);
  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);

  // Seek the poster to the clip start once metadata is available.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const seek = () => {
      try {
        v.currentTime = clip.start + 0.05;
      } catch {
        /* not seekable yet */
      }
    };
    v.addEventListener("loadedmetadata", seek);
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [clip.start]);

  function hoverPlay() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clip.start;
    void v.play().catch(() => undefined);
  }
  function hoverStop() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = clip.start + 0.05;
  }
  function onTimeUpdate() {
    const v = videoRef.current;
    if (v && v.currentTime >= clip.end) v.currentTime = clip.start; // loop range
  }

  function edit() {
    selectClip(clip.id);
    setGalleryOpen(false);
  }
  function exportClip() {
    selectClip(clip.id);
    setGalleryOpen(false);
    setExportModalOpen(true);
  }

  return (
    <div className="panel group flex flex-col overflow-hidden">
      {/* 9:16 preview */}
      <div
        className="relative aspect-[9/16] cursor-pointer overflow-hidden bg-black"
        onMouseEnter={hoverPlay}
        onMouseLeave={hoverStop}
        onClick={edit}
      >
        {mediaId ? (
          <video
            ref={videoRef}
            src={`/api/media/${mediaId}`}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            no preview
          </div>
        )}

        {/* rank + score overlays */}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
          #{rank}
        </span>
        <span
          className={clsx(
            "absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-sm font-black tabular-nums",
            scoreColor(clip.score),
          )}
        >
          {clip.score}
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-200">
          {formatTimecode(clip.end - clip.start)}
        </span>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black">
            ▶ Preview
          </span>
        </span>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-xs font-bold text-white">{clip.title}</p>
        <GradeChips rating={clip.rating} />
        <p className="mt-1.5 line-clamp-2 text-[10px] text-slate-500">
          {clip.reason}
        </p>
        <div className="mt-auto flex gap-1.5 pt-2.5">
          <button className="btn-primary flex-1 !py-1.5 text-[11px]" onClick={edit}>
            Edit
          </button>
          <button
            className="btn-ghost !px-2 !py-1.5 text-[11px]"
            onClick={() => setDetailClip(clip.id)}
            title="Rating & analysis"
          >
            Details
          </button>
          <button
            className="btn-ghost !px-2 !py-1.5 text-[11px]"
            onClick={exportClip}
            title="Export this clip"
          >
            ⬇
          </button>
        </div>
      </div>
    </div>
  );
}
