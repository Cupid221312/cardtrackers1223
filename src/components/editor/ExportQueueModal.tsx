"use client";

import { useEffect, useState } from "react";
import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import { linesInRange } from "@/services/ai/captions";
import { compactDuration, computeKeepSegments } from "@/services/ai/silence";
import type { ClipCandidate, ExportPreset, ExportRequest } from "@/lib/types";
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
  const clipCount = useEditorStore((s) => s.clips.length);
  const silenceCut = useEditorStore((s) => s.silenceCut);
  const transcript = useEditorStore((s) => s.transcript);
  const [preset, setPreset] = useState<ExportPreset>("tiktok");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);

  const compactLen =
    clip && silenceCut.enabled && transcript
      ? compactDuration(
          computeKeepSegments(
            transcript.words,
            clip.start,
            clip.end,
            silenceCut.minGap,
          ),
        )
      : null;

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

  function buildPayload(target: ClipCandidate): ExportRequest {
    const s = useEditorStore.getState();
    if (!s.source) throw new Error("No source media");
    return {
      mediaId: s.source.mediaId,
      preset,
      clip: { title: target.title, start: target.start, end: target.end },
      captions: {
        lines: s.captionsEnabled
          ? linesInRange(s.captionLines, target.start, target.end)
          : [],
        style: s.captionStyle,
      },
      // In batch mode each clip gets its own hook title unless the user
      // wrote a custom banner, which then applies everywhere.
      hookBanner: s.hookBannerEdited
        ? s.hookBanner
        : { ...s.hookBanner, text: target.title },
      framing: s.framing,
      filters: s.filters,
      keyframes: s.keyframesByClip[target.id] ?? [],
      audio: {
        volume: s.audio.volume,
        noiseReduction: s.audio.noiseReduction,
        volumeLeveling: s.audio.volumeLeveling,
        musicMediaId: s.audio.musicMediaId,
        musicVolume: s.audio.musicVolume,
        ducking: s.audio.ducking,
      },
      stickers: s.stickers.map((st) => ({
        dataUrl: st.dataUrl,
        x: st.x,
        y: st.y,
        scale: st.scale,
        opacity: st.opacity,
      })),
      overlays: s.overlays,
      keepSegments:
        s.silenceCut.enabled && s.transcript
          ? computeKeepSegments(
              s.transcript.words,
              target.start,
              target.end,
              s.silenceCut.minGap,
            )
          : [],
      progressBar: s.progressBar,
      aspectRatio: s.aspectRatio,
      sourceWidth: s.source.width,
      sourceHeight: s.source.height,
    };
  }

  async function submitClip(target: ClipCandidate) {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(target)),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? "Export failed to start");
    useEditorStore.getState().upsertExportJob(body.job);
  }

  async function startExport() {
    if (!source || !clip) return;
    setSubmitting(true);
    setError("");
    try {
      await submitClip(clip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  async function startExportAll() {
    const allClips = useEditorStore.getState().clips;
    if (!source || allClips.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      for (const c of allClips) {
        await submitClip(c);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch export failed");
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
              {(clip.end - clip.start).toFixed(1)}s
              {compactLen !== null && (
                <span className="text-brand-green">
                  {" "}
                  → {compactLen.toFixed(1)}s after jump cuts
                </span>
              )}
              )
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
          <div className="mt-2.5 flex gap-1.5">
            <button
              className="btn-primary flex-1"
              onClick={startExport}
              disabled={!clip || !source || submitting}
            >
              {submitting ? "Queueing…" : "Render 1080p · 60fps"}
            </button>
            {clipCount > 1 && (
              <button
                className="btn-ghost shrink-0"
                onClick={startExportAll}
                disabled={!source || submitting}
                title="Queue every detected clip with this preset"
              >
                All {clipCount}
              </button>
            )}
          </div>
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
                  <>
                    <button
                      className="rounded bg-ink-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-ink-600"
                      onClick={() =>
                        setPreviewing(previewing === job.id ? null : job.id)
                      }
                    >
                      {previewing === job.id ? "Hide" : "▶ Preview"}
                    </button>
                    <a
                      href={job.outputUrl}
                      className="rounded bg-brand-green/15 px-2 py-0.5 text-[11px] font-semibold text-brand-green hover:bg-brand-green/25"
                    >
                      Download
                    </a>
                  </>
                )}
              </div>
              {previewing === job.id && job.outputUrl && (
                <video
                  src={job.outputUrl}
                  controls
                  autoPlay
                  className="mt-2 max-h-72 w-full rounded-lg bg-black"
                />
              )}
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
