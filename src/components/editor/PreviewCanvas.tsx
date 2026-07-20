"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  interpolateKeyframes,
  redoEdit,
  undoEdit,
  useEditorStore,
  useSelectedClip,
  useSelectedClipKeyframes,
} from "@/lib/store/editorStore";
import CaptionOverlay from "@/components/editor/CaptionOverlay";
import HookBannerOverlay from "@/components/editor/HookBannerOverlay";
import StickerLayer from "@/components/editor/StickerLayer";
import { formatTime } from "@/lib/time";
import {
  type TimeRange,
  computeKeepSegments,
  nextKeepTime,
} from "@/services/ai/silence";

/**
 * The 9:16 live preview. A hidden main <video> drives:
 *  - a blurred cover <canvas> background (fit-blur mode), painted per frame
 *    so it can never drift out of sync,
 *  - the foreground video layer with framing/zoom/pan transforms,
 *  - hook banner, karaoke captions, and sticker overlays.
 */
export default function PreviewCanvas() {
  const source = useEditorStore((s) => s.source);
  const framing = useEditorStore((s) => s.framing);
  const filters = useEditorStore((s) => s.filters);
  const audio = useEditorStore((s) => s.audio);
  const playing = useEditorStore((s) => s.playing);
  const seekVersion = useEditorStore((s) => s.seekVersion);
  const clip = useSelectedClip();
  const keyframes = useSelectedClipKeyframes();
  const silenceCut = useEditorStore((s) => s.silenceCut);
  const words = useEditorStore((s) => s.transcript?.words ?? null);

  // Live jump cuts: the rAF loop reads this via ref and skips silences.
  const keepSegments = useMemo<TimeRange[] | null>(() => {
    if (!silenceCut.enabled || !clip || !words) return null;
    return computeKeepSegments(words, clip.start, clip.end, silenceCut.minGap);
  }, [silenceCut.enabled, silenceCut.minGap, clip, words]);
  const keepRef = useRef<TimeRange[] | null>(null);
  keepRef.current = keepSegments;

  const videoRef = useRef<HTMLVideoElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 270, height: 480 });

  // ---- fit the 9:16 frame into the available center area ------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      const h = Math.min(height - 56, (width - 24) * (16 / 9));
      setFrameSize({ height: h, width: h * (9 / 16) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- playback loop: video is the clock, store mirrors it ----------------
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      const state = useEditorStore.getState();
      if (video && !video.paused) {
        const t = video.currentTime;
        const c = state.clips.find((cl) => cl.id === state.selectedClipId);
        if (c && t >= c.end) {
          video.currentTime = c.start; // loop the selected clip
        } else if (c && keepRef.current) {
          // Jump-cut preview: hop over removed silences in real time.
          const next = nextKeepTime(keepRef.current, t);
          if (next === null) {
            video.currentTime = keepRef.current[0]?.start ?? c.start;
          } else if (next - t > 0.03) {
            video.currentTime = next;
          }
        }
        state.setCurrentTime(video.currentTime);
        // paint blurred background
        const canvas = bgCanvasRef.current;
        if (canvas && state.framing.mode === "fit-blur") {
          const ctx = canvas.getContext("2d");
          if (ctx && video.videoWidth > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- respond to store-driven play/pause and seeks -----------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.play().catch(() => useEditorStore.getState().setPlaying(false));
      musicRef.current?.play().catch(() => undefined);
    } else {
      video.pause();
      musicRef.current?.pause();
    }
  }, [playing, source]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const { seekTime } = useEditorStore.getState();
    if (Math.abs(video.currentTime - seekTime) > 0.05) {
      video.currentTime = seekTime;
    }
    // repaint background on a paused seek
    requestAnimationFrame(() => {
      const canvas = bgCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
    });
  }, [seekVersion]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = Math.min(1, audio.volume);
    const music = musicRef.current;
    if (music) music.volume = Math.min(1, audio.musicVolume);
  }, [audio.volume, audio.musicVolume]);

  const togglePlay = useCallback(() => {
    if (source) useEditorStore.getState().togglePlay();
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)
        return;
      const s = useEditorStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redoEdit();
        else undoEdit();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (!s.source) return;
        e.preventDefault();
        const step = (e.shiftKey ? 5 : 1) * (e.code === "ArrowLeft" ? -1 : 1);
        s.seekTo(
          Math.min(Math.max(0, s.currentTime + step), s.source.duration),
        );
      } else if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) {
        const c = s.clips.find((cl) => cl.id === s.selectedClipId);
        if (c && s.currentTime > c.start + 3 && s.currentTime < c.end - 3) {
          e.preventDefault();
          s.splitClip(c.id, s.currentTime);
        }
      } else if (e.code === "KeyI" || e.code === "KeyO") {
        // Trim the selected clip's in/out point to the playhead.
        const c = s.clips.find((cl) => cl.id === s.selectedClipId);
        if (!c) return;
        e.preventDefault();
        if (e.code === "KeyI" && s.currentTime < c.end - 1) {
          s.setClipRange(c.id, s.currentTime, c.end);
        } else if (e.code === "KeyO" && s.currentTime > c.start + 1) {
          s.setClipRange(c.id, c.start, s.currentTime);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  // ---- framing math -------------------------------------------------------
  const currentTime = useEditorStore((s) => s.currentTime);
  const kf = interpolateKeyframes(
    keyframes,
    clip ? currentTime - clip.start : 0,
    { zoom: framing.zoom, panX: framing.panX, panY: framing.panY },
  );
  const effZoom = kf.zoom;
  const cssFilter = `brightness(${1 + filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation})`;

  const foregroundStyle: React.CSSProperties =
    framing.mode === "crop"
      ? {
          objectFit: "cover",
          transform: `scale(${effZoom}) translate(${kf.panX * -18}%, ${kf.panY * -18}%)`,
          filter: cssFilter,
        }
      : {
          objectFit: "contain",
          transform: `scale(${effZoom}) translate(${kf.panX * -12}%, ${kf.panY * -12}%)`,
          filter: cssFilter,
        };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-col items-center justify-center gap-3"
    >
      {/* ---- canvas frame ------------------------------------------------- */}
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-2xl border border-ink-600 bg-black shadow-panel"
        style={{ width: frameSize.width, height: frameSize.height }}
        onClick={togglePlay}
      >
        {source ? (
          <>
            {framing.mode === "fit-blur" && (
              <canvas
                ref={bgCanvasRef}
                width={90}
                height={160}
                className="absolute inset-0 h-full w-full scale-125 object-cover"
                style={{
                  filter: `blur(${filters.backgroundBlur * (frameSize.height / 1920)}px) brightness(0.75) ${cssFilter}`,
                }}
              />
            )}
            <video
              ref={videoRef}
              src={source.previewUrl}
              className="absolute inset-0 z-10 h-full w-full"
              style={foregroundStyle}
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                const canvas = bgCanvasRef.current;
                const ctx = canvas?.getContext("2d");
                if (canvas && ctx && v.videoWidth > 0) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                }
              }}
            />
            {audio.musicUrl && (
              <audio ref={musicRef} src={audio.musicUrl} loop />
            )}
            <HookBannerOverlay canvasHeight={frameSize.height} />
            <CaptionOverlay canvasHeight={frameSize.height} />
            <StickerLayer />
          </>
        ) : (
          <EmptyCanvas />
        )}

        {/* subtle 9:16 frame chrome */}
        <div className="pointer-events-none absolute inset-0 z-40 rounded-2xl ring-1 ring-inset ring-white/5" />
      </div>

      {/* ---- transport ---------------------------------------------------- */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-700 text-white transition hover:bg-accent disabled:opacity-40"
          onClick={togglePlay}
          disabled={!source}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current">
              <path d="M8 5.5v13a.7.7 0 0 0 1.07.6l10.14-6.5a.7.7 0 0 0 0-1.2L9.07 4.9A.7.7 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>
        <span className="tabular-nums">
          {formatTime(currentTime)}
          <span className="mx-1 text-slate-600">/</span>
          {formatTime(source?.duration ?? 0)}
        </span>
        {clip && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-glow">
            Clip: {formatTime(clip.start)}–{formatTime(clip.end)}
          </span>
        )}
        <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
          9:16 · 1080×1920
        </span>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-ink-850 to-ink-950 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-ink-600 bg-ink-800">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-slate-500">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm6 3.6v5.8a.6.6 0 0 0 .92.5l4.55-2.9a.6.6 0 0 0 0-1l-4.55-2.9a.6.6 0 0 0-.92.5Z" />
        </svg>
      </div>
      <div className="px-6">
        <p className="text-sm font-semibold text-slate-300">No media loaded</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Import a YouTube link or upload an MP4 in the left panel to start
          clipping.
        </p>
      </div>
    </div>
  );
}
