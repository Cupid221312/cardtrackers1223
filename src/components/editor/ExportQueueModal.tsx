"use client";

import { useEffect, useState } from "react";
import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import { linesInRange } from "@/services/ai/captions";
import type { ExportPreset, ExportRequest } from "@/lib/types";
import { formatTime } from "@/lib/time";
import clsx from "clsx";

const PRESETS: Array<{ id: ExportPreset; label: string; note: string }> = [
  { id: "tiktok", label: "TikTok", note: "1080×1920 · 60fps · CRF 20" },
  { id: "shorts", label: "YouTube Shorts", note: "1080×1920 · 60fps · CRF 18" },
  { id: "reels", label: "Instagram Reels", note: "1080×1920 · 60fps · AAC 128k" },
];

export default function ExportQueueModal() {
  const open = useEditorStore((s) => s.exportModalOpen);
  const setOpen = useEditorStore((s) => s.setExportModalOpen);
  const jobs = useEditorStore((s) => s.exportJobs);
  const clip = useSelectedClip();
  const source = useEditorStore((s) => s.source);
  const [preset, setPreset] = useState<ExportPreset>("tiktok");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Poll active jobs while the app is open (modal or not) so the header
  // badge stays live.
  useEffect(() => {
    const active = jobs.filter(
      (j) => j.status === "queued" || j.status === "processing",
    );
    if (active.length === 0) return;
    const interval = setInterval(async () => {
      for (const job of active) {
        try {
          const res = await fetch(`/api/export/${job.id}`);
          if (!res.ok) continue;
          const body = await res.json();
          useEditorStore.getState().upsertExportJob(body.job);
        } catch {
          // transient poll failure — next tick retries
        }
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [jobs]);

  if (!open) return null;

  async function startExport() {
    const s = useEditorStore.getState();
    if (!source || !clip) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: ExportRequest = {
        mediaId: source.mediaId,
        preset,
        clip: { title: clip.title, start: clip.start, end: clip.end },
        captions: {
          lines: linesInRange(s.captionLines, clip.start, clip.end),
          style: s.captionStyle,
        },
        hookBanner: s.hookBanner,
        framing: s.framing,
        filters: s.filters,
        keyframes: s.keyframesByClip[clip.id] ?? [],
        audio: {
          volume: s.audio.volume,
          noiseReduction: s.audio.noiseReduction,
          volumeLeveling: s.audio.volumeLeveling,
          musicMediaId: s.audio.musicMediaId,
          musicVolume: s.audio.musicVolume,
        },
        stickers: s.stickers.map((st) => ({
          dataUrl: st.dataUrl,
          x: st.x,
          y: st.y,
          scale: st.scale,
          opacity: st.opacity,
        })),
        sourceWidth: source.width,
        sourceHeight: source.height,
      };
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Export failed to start");
      s.upsertExportJob(body.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="panel w-[480px] max-w-[92vw] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Export Queue</h2>
          <button
            className="text-slate-500 hover:text-white"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ---- new render -------------------------------------------------- */}
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          {clip ? (
            <p className="mb-2 text-xs text-slate-400">
              Rendering{" "}
              <span className="font-semibold text-slate-200">{clip.title}</span>{" "}
              · {formatTime(clip.start)}–{formatTime(clip.end)} (
              {(clip.end - clip.start).toFixed(1)}s)
            </p>
          ) : (
            <p className="mb-2 text-xs text-brand-yellow">
              Select a clip in the left panel first.
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map((pr) => (
              <button
                key={pr.id}
                onClick={() => setPreset(pr.id)}
                className={clsx(
                  "rounded-lg border px-2 py-2 text-left transition",
                  preset === pr.id
                    ? "border-accent/70 bg-accent/10"
                    : "border-ink-700 bg-ink-850 hover:border-ink-500",
                )}
              >
                <span className="block text-xs font-semibold text-slate-100">
                  {pr.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {pr.note}
                </span>
              </button>
            ))}
          </div>
          <button
            className="btn-primary mt-2.5 w-full"
            onClick={startExport}
            disabled={!clip || !source || submitting}
          >
            {submitting ? "Queueing…" : "Render 1080p · 60fps"}
          </button>
          {error && (
            <p className="mt-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-2.5 py-1.5 text-xs text-brand-red">
              {error}
            </p>
          )}
        </div>

        {/* ---- queue ------------------------------------------------------- */}
        <div className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {jobs.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-600">
              Nothing rendered yet.
            </p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-200">
                  {job.clipTitle}
                </span>
                <span
                  className={clsx(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    job.status === "done" && "bg-brand-green/15 text-brand-green",
                    job.status === "error" && "bg-brand-red/15 text-brand-red",
                    (job.status === "processing" || job.status === "queued") &&
                      "bg-accent/15 text-accent-glow",
                  )}
                >
                  {job.status}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      job.status === "error" ? "bg-brand-red" : "bg-accent",
                    )}
                    style={{ width: `${Math.round(job.progress * 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-[10px] uppercase tracking-wide text-slate-500">
                  {PRESETS.find((p) => p.id === job.preset)?.label ?? job.preset}
                </span>
                {job.status === "done" && job.outputUrl && (
                  <a
                    href={job.outputUrl}
                    className="rounded bg-brand-green/15 px-2 py-0.5 text-[11px] font-semibold text-brand-green hover:bg-brand-green/25"
                  >
                    Download
                  </a>
                )}
              </div>
              {job.error && (
                <p className="mt-1 text-[11px] text-brand-red">{job.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
