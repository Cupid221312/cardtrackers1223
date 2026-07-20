"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { linesInRange } from "@/services/ai/captions";
import { RatingAxes, scoreColor } from "@/components/editor/RatingBadges";
import { formatTime } from "@/lib/time";
import clsx from "clsx";

/**
 * Opus-style clip inspector: big overall score + Hook/Flow/Value/Trend
 * grades, a scene-analysis paragraph with a transcript-only toggle, and
 * quick actions (open in editor, 9:16 export, duplicate).
 */
export default function ClipDetailModal() {
  const detailClipId = useEditorStore((s) => s.detailClipId);
  const clip = useEditorStore((s) =>
    s.clips.find((c) => c.id === s.detailClipId) ?? null,
  );
  const captionLines = useEditorStore((s) => s.captionLines);
  const [transcriptOnly, setTranscriptOnly] = useState(false);

  if (!detailClipId || !clip) return null;

  const close = () => useEditorStore.getState().setDetailClip(null);
  const transcript = linesInRange(captionLines, clip.start, clip.end)
    .map((l) => l.words.map((w) => w.text).join(" "))
    .join(" ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="panel flex max-h-[86vh] w-[760px] max-w-[95vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- rating rail --------------------------------------------- */}
        <div className="flex w-40 shrink-0 flex-col items-center border-r border-ink-700 bg-ink-900 p-4">
          <span className={clsx("text-5xl font-black tabular-nums", scoreColor(clip.score))}>
            {clip.score}
          </span>
          <span className="mb-4 text-[10px] uppercase tracking-widest text-slate-500">
            / 100
          </span>
          <div className="w-full">
            <RatingAxes rating={clip.rating} size="lg" />
          </div>
        </div>

        {/* ---- detail ------------------------------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-white">
                {clip.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatTime(clip.start)}–{formatTime(clip.end)} ·{" "}
                {(clip.end - clip.start).toFixed(0)}s
              </p>
            </div>
            <button
              className="shrink-0 text-slate-500 hover:text-white"
              onClick={close}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="panel-title">
              {transcriptOnly ? "Transcript" : "Scene analysis"}
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                className="accent-accent"
                checked={transcriptOnly}
                onChange={(e) => setTranscriptOnly(e.target.checked)}
              />
              Transcript only
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-3 text-[13px] leading-relaxed text-slate-300">
            {transcriptOnly ? transcript || "No transcript in range." : clip.sceneAnalysis}
          </div>

          {clip.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {clip.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 text-[10px] text-slate-400"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              className="btn-primary !py-1.5"
              onClick={() => {
                useEditorStore.getState().selectClip(clip.id);
                close();
              }}
            >
              Open in editor
            </button>
            <button
              className="btn-ghost !py-1.5"
              onClick={() => {
                const s = useEditorStore.getState();
                s.selectClip(clip.id);
                s.setDetailClip(null);
                s.setExportModalOpen(true);
              }}
            >
              Export 9:16
            </button>
            <span className="ml-auto self-center rounded border border-ink-600 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
              {clip.reason}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
