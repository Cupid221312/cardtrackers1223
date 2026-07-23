"use client";

import { useEffect, useRef, useState } from "react";
import { clearEditHistory, useEditorStore } from "@/lib/store/editorStore";
import TranscriptPanel from "@/components/editor/TranscriptPanel";
import { GradeChips } from "@/components/editor/RatingBadges";
import { findClips } from "@/services/ai/clipFinder";
import { formatTime } from "@/lib/time";
import type {
  ClipCandidate,
  SavedProjectSummary,
  SourceMedia,
  Transcript,
} from "@/lib/types";
import clsx from "clsx";

async function readJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export default function SourcePanel() {
  const store = useEditorStore;
  const source = useEditorStore((s) => s.source);
  const ingesting = useEditorStore((s) => s.ingesting);
  const ingestError = useEditorStore((s) => s.ingestError);
  const transcribing = useEditorStore((s) => s.transcribing);
  const transcript = useEditorStore((s) => s.transcript);
  const clips = useEditorStore((s) => s.clips);
  const detecting = useEditorStore((s) => s.detectingClips);
  const settings = useEditorStore((s) => s.clipFinderSettings);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);

  const [linkUrl, setLinkUrl] = useState("");
  const [recent, setRecent] = useState<SavedProjectSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((body) => setRecent(body.projects ?? []))
      .catch(() => undefined);
  }, []);

  // ---- ingestion ----------------------------------------------------------

  async function handleUpload(file: File) {
    const s = store.getState();
    s.setIngesting(true);
    try {
      // Stream the raw file (no multipart buffering) so large/long videos
      // upload fast and don't exhaust server memory.
      const body = await readJsonOrThrow(
        await fetch("/api/upload", {
          method: "POST",
          headers: {
            "x-filename": file.name,
            "content-type": file.type || "application/octet-stream",
          },
          body: file,
        }),
      );
      const media: SourceMedia = {
        mediaId: body.mediaId,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        duration: body.duration,
        width: body.width,
        height: body.height,
        origin: "upload",
      };
      s.setSource(media);
      clearEditHistory(); // new session — old edits must not be undoable
      s.setIngesting(false);
      void transcribe(media);
    } catch (err) {
      s.setIngesting(false, err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleUrlImport() {
    const s = store.getState();
    if (!linkUrl.trim()) return;
    s.setIngesting(true);
    try {
      const body = await readJsonOrThrow(
        await fetch("/api/ingest/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: linkUrl.trim() }),
        }),
      );
      const media: SourceMedia = {
        mediaId: body.mediaId,
        previewUrl: `/api/media/${body.mediaId}`,
        name: body.title,
        duration: body.duration,
        width: body.width,
        height: body.height,
        origin: "youtube",
      };
      s.setSource(media);
      clearEditHistory(); // new session — old edits must not be undoable
      s.setIngesting(false);
      void transcribe(media);
    } catch (err) {
      s.setIngesting(
        false,
        err instanceof Error ? err.message : "YouTube import failed",
      );
    }
  }

  async function handleDemo() {
    const s = store.getState();
    s.setIngesting(true);
    try {
      const body = await readJsonOrThrow(
        await fetch("/api/demo", { method: "POST" }),
      );
      const media: SourceMedia = {
        mediaId: body.mediaId,
        previewUrl: `/api/media/${body.mediaId}`,
        name: body.title,
        duration: body.duration,
        width: body.width,
        height: body.height,
        origin: "upload",
      };
      s.setSource(media);
      clearEditHistory();
      s.setIngesting(false);
      void transcribe(media);
    } catch (err) {
      s.setIngesting(false, err instanceof Error ? err.message : "Demo failed");
    }
  }

  async function openProject(mediaId: string) {
    const s = store.getState();
    s.setIngesting(true);
    try {
      const body = await readJsonOrThrow(await fetch(`/api/projects/${mediaId}`));
      s.restoreProject(body.project);
      clearEditHistory();
      s.setIngesting(false);
    } catch (err) {
      s.setIngesting(
        false,
        err instanceof Error ? err.message : "Could not open project",
      );
    }
  }

  async function removeProject(mediaId: string) {
    setRecent((r) => r.filter((p) => p.mediaId !== mediaId));
    await fetch(`/api/projects/${mediaId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }

  // ---- transcription + clip detection -------------------------------------

  async function transcribe(media: SourceMedia) {
    const s = store.getState();
    s.setTranscribing(true);
    try {
      const body = await readJsonOrThrow(
        await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId: media.mediaId }),
        }),
      );
      s.setTranscript(body.transcript as Transcript);
      s.setTranscribing(false);
      void detectClips(body.transcript as Transcript);
    } catch (err) {
      s.setTranscribing(false);
      s.setIngesting(
        false,
        err instanceof Error ? err.message : "Transcription failed",
      );
    }
  }

  async function detectClips(t?: Transcript) {
    const s = store.getState();
    const tr = t ?? s.transcript;
    if (!tr) return;
    s.setDetectingClips(true);

    // Best-effort: pull the decoded waveform so loud/hype moments feed the
    // scoring formula (helps stream/gaming clips with no textual hook).
    let audio: { peaks?: number[]; peaksDuration?: number } | undefined;
    if (s.source?.mediaId && s.source.duration) {
      try {
        const wf = await fetch(`/api/media/${s.source.mediaId}/waveform`);
        if (wf.ok) {
          const wb = await wf.json();
          if (Array.isArray(wb.peaks) && wb.peaks.length) {
            audio = { peaks: wb.peaks, peaksDuration: s.source.duration };
          }
        }
      } catch {
        /* no waveform — scoring falls back to text-only */
      }
    }

    try {
      const body = await readJsonOrThrow(
        await fetch("/api/clips/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: tr,
            settings: s.clipFinderSettings,
            audio,
          }),
        }),
      );
      s.setClips(body.clips as ClipCandidate[]);
      if (body.clips.length > 0) {
        s.selectClip(body.clips[0].id);
        s.setGalleryOpen(true); // show the ranked results grid
      }
    } catch {
      // Server route unavailable — heuristics run identically client-side.
      const clips = findClips(tr, s.clipFinderSettings, {
        peaks: audio?.peaks,
        peaksDuration: audio?.peaksDuration,
      });
      s.setClips(clips);
      if (clips.length > 0) {
        s.selectClip(clips[0].id);
        s.setGalleryOpen(true);
      }
    } finally {
      s.setDetectingClips(false);
    }
  }

  const busy = ingesting || transcribing;

  return (
    <div className="flex flex-col gap-3">
      {/* ---- importer ---------------------------------------------------- */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Source Media</h2>
        <div className="flex gap-1.5">
          <input
            className="text-input"
            placeholder="YouTube / Twitch / Kick link…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
            disabled={busy}
          />
          <button
            className="btn-ghost shrink-0 !px-2.5"
            onClick={handleUrlImport}
            disabled={busy || !linkUrl.trim()}
            aria-label="Import from link"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 4a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 1.4-1.4L11 14.6V5a1 1 0 0 1 1-1Z" />
            </svg>
          </button>
        </div>
        <div className="my-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-600">
          <div className="h-px flex-1 bg-ink-700" /> or <div className="h-px flex-1 bg-ink-700" />
        </div>
        <button
          className="btn-ghost w-full border-dashed"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {ingesting ? "Importing…" : "Upload MP4 / MOV"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = "";
          }}
        />
        {!source && (
          <button
            className="mt-2 w-full rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent-glow transition hover:bg-accent/15 disabled:opacity-40"
            onClick={handleDemo}
            disabled={busy}
          >
            ▶ Try with generated demo footage
          </button>
        )}
        {ingestError && (
          <p className="mt-2 rounded-lg border border-brand-red/30 bg-brand-red/10 px-2.5 py-1.5 text-xs text-brand-red">
            {ingestError}
          </p>
        )}
        {source && (
          <div className="mt-2.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs">
            <p className="truncate font-medium text-slate-200">{source.name}</p>
            <p className="mt-0.5 text-slate-500">
              {formatTime(source.duration)} · {source.width}×{source.height} ·{" "}
              {source.origin === "youtube" ? "YouTube" : "Upload"}
            </p>
          </div>
        )}
        {recent.length > 0 && (
          <div className="mt-2.5 border-t border-ink-700 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Recent projects
            </p>
            <div className="flex flex-col gap-1">
              {recent.map((p) => (
                <div
                  key={p.mediaId}
                  className={clsx(
                    "group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition",
                    source?.mediaId === p.mediaId
                      ? "border-accent/50 bg-accent/10"
                      : "border-ink-700 bg-ink-900 hover:border-ink-500",
                  )}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openProject(p.mediaId)}
                    disabled={busy}
                  >
                    <p className="truncate text-[11px] font-medium text-slate-200">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatTime(p.duration)} · {p.clipCount} clip
                      {p.clipCount === 1 ? "" : "s"}
                    </p>
                  </button>
                  <button
                    className="hidden shrink-0 text-slate-600 hover:text-brand-red group-hover:block"
                    onClick={() => removeProject(p.mediaId)}
                    aria-label={`Delete project ${p.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---- AI clip finder ---------------------------------------------- */}
      <section className="panel p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="panel-title">AI Clip Finder</h2>
          {transcribing && (
            <span className="animate-pulse text-[11px] text-accent-glow">
              Transcribing…
            </span>
          )}
        </div>

        <div className="mb-2.5 grid grid-cols-3 gap-1.5">
          <label className="text-[11px] text-slate-400">
            Min s
            <input
              type="number"
              className="text-input mt-1 !px-2 !py-1"
              value={settings.minDuration}
              min={10}
              max={settings.maxDuration}
              onChange={(e) =>
                store.getState().setClipFinderSettings({
                  minDuration: Number(e.target.value) || 30,
                })
              }
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Max s
            <input
              type="number"
              className="text-input mt-1 !px-2 !py-1"
              value={settings.maxDuration}
              min={settings.minDuration}
              max={180}
              onChange={(e) =>
                store.getState().setClipFinderSettings({
                  maxDuration: Number(e.target.value) || 60,
                })
              }
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Clips
            <input
              type="number"
              className="text-input mt-1 !px-2 !py-1"
              value={settings.maxClips}
              min={1}
              max={12}
              onChange={(e) =>
                store.getState().setClipFinderSettings({
                  maxClips: Number(e.target.value) || 6,
                })
              }
            />
          </label>
        </div>

        <button
          className="btn-primary w-full"
          onClick={() => void detectClips()}
          disabled={!transcript || detecting}
        >
          {detecting ? "Analyzing…" : "✦ Find Viral Clips"}
        </button>

        <div className="mt-2.5 flex flex-col gap-1.5">
          {clips.map((clip) => (
            <div
              key={clip.id}
              role="button"
              tabIndex={0}
              onClick={() => store.getState().selectClip(clip.id)}
              onKeyDown={(e) =>
                e.key === "Enter" && store.getState().selectClip(clip.id)
              }
              className={clsx(
                "cursor-pointer rounded-lg border px-2.5 py-2 text-left transition",
                selectedClipId === clip.id
                  ? "border-accent/70 bg-accent/10 shadow-glow"
                  : "border-ink-700 bg-ink-900 hover:border-ink-500",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-slate-100">
                  {clip.title}
                </span>
                <span
                  className={clsx(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                    clip.score >= 75
                      ? "bg-brand-green/15 text-brand-green"
                      : clip.score >= 55
                        ? "bg-brand-yellow/15 text-brand-yellow"
                        : "bg-ink-700 text-slate-400",
                  )}
                >
                  {clip.score}
                </span>
              </div>
              <GradeChips rating={clip.rating} />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-[11px] text-slate-500">
                  {formatTime(clip.start)}–{formatTime(clip.end)}
                </p>
                <button
                  className="shrink-0 text-[10px] font-medium text-accent-glow hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    store.getState().setDetailClip(clip.id);
                  }}
                >
                  Details →
                </button>
              </div>
            </div>
          ))}
          {clips.length === 0 && transcript && !detecting && (
            <p className="text-center text-xs text-slate-500">
              No clips yet — run the finder.
            </p>
          )}
        </div>
      </section>

      {/* ---- transcript --------------------------------------------------- */}
      <TranscriptPanel />
    </div>
  );
}
