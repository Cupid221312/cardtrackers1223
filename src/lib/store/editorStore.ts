"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  AudioSettings,
  CaptionLine,
  CaptionStyle,
  CaptionTemplateId,
  ClipCandidate,
  ClipFinderSettings,
  ExportJobInfo,
  Framing,
  GraphicOverlay,
  HookBanner,
  SavedProject,
  ProgressBarSettings,
  SilenceCutSettings,
  SourceMedia,
  Sticker,
  Transcript,
  VisualFilters,
  ZoomKeyframe,
} from "@/lib/types";
import type { AspectRatio } from "@/lib/aspects";
import { CAPTION_TEMPLATES } from "@/lib/captionTemplates";
import { buildCaptionLines } from "@/services/ai/captions";
import { overallScore, rateClip, sceneAnalysis } from "@/services/ai/rating";
import { clamp } from "@/lib/time";

interface EditorState {
  // ---- source & AI pipeline ------------------------------------------------
  source: SourceMedia | null;
  ingesting: boolean;
  ingestError: string;
  transcript: Transcript | null;
  transcribing: boolean;
  captionLines: CaptionLine[];
  clips: ClipCandidate[];
  detectingClips: boolean;
  clipFinderSettings: ClipFinderSettings;
  selectedClipId: string | null;

  // ---- playback ------------------------------------------------------------
  currentTime: number;
  playing: boolean;
  /** Bumped whenever the UI (not the video element) requests a seek. */
  seekVersion: number;
  seekTime: number;

  // ---- styling & effects ---------------------------------------------------
  captionStyle: CaptionStyle;
  hookBanner: HookBanner;
  hookBannerEdited: boolean;
  framing: Framing;
  aspectRatio: AspectRatio;
  filters: VisualFilters;
  audio: AudioSettings;
  silenceCut: SilenceCutSettings;
  progressBar: ProgressBarSettings;
  stickers: Sticker[];
  overlays: GraphicOverlay[];
  /** Zoom/pan keyframes keyed by clip id (times relative to clip start). */
  keyframesByClip: Record<string, ZoomKeyframe[]>;

  // ---- timeline ------------------------------------------------------------
  pxPerSec: number;

  /** Click-to-track picking mode: canvas shows the full frame and waits
   *  for the user to drop a dot on the subject. */
  trackPicking: boolean;

  // ---- export --------------------------------------------------------------
  exportJobs: ExportJobInfo[];
  exportModalOpen: boolean;

  /** Clip whose rating/analysis detail modal is open, or null. */
  detailClipId: string | null;
  /** Whether the full-screen clips results gallery is open. */
  galleryOpen: boolean;

  // ---- actions -------------------------------------------------------------
  setDetailClip: (clipId: string | null) => void;
  setGalleryOpen: (v: boolean) => void;
  setSource: (source: SourceMedia | null) => void;
  setIngesting: (v: boolean, error?: string) => void;
  setTranscribing: (v: boolean) => void;
  setTranscript: (t: Transcript | null) => void;
  updateWordText: (wordId: string, text: string) => void;
  /** Shift every word of a caption line by delta seconds (timeline drag). */
  shiftCaptionLine: (lineId: string, delta: number) => void;
  setDetectingClips: (v: boolean) => void;
  setClips: (clips: ClipCandidate[]) => void;
  setClipFinderSettings: (s: Partial<ClipFinderSettings>) => void;
  selectClip: (clipId: string | null) => void;
  setClipRange: (clipId: string, start: number, end: number) => void;
  /** Create a user-defined clip window at the playhead and select it. */
  addManualClip: () => void;
  /** Split a clip into two at a source-time inside it. */
  splitClip: (clipId: string, at: number) => void;
  /** Split a clip into segments at multiple source-time cut points. */
  splitClipAtTimes: (clipId: string, sourceTimes: number[]) => void;
  /** Hydrate a full editing session from a saved project. */
  restoreProject: (project: SavedProject) => void;

  setCurrentTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  togglePlay: () => void;
  seekTo: (t: number) => void;

  applyTemplate: (id: CaptionTemplateId) => void;
  updateCaptionStyle: (patch: Partial<CaptionStyle>) => void;
  updateHookBanner: (patch: Partial<HookBanner>) => void;
  updateFraming: (patch: Partial<Framing>) => void;
  setAspectRatio: (a: AspectRatio) => void;
  updateFilters: (patch: Partial<VisualFilters>) => void;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  updateSilenceCut: (patch: Partial<SilenceCutSettings>) => void;
  updateProgressBar: (patch: Partial<ProgressBarSettings>) => void;
  addSticker: (sticker: Sticker) => void;
  updateSticker: (id: string, patch: Partial<Sticker>) => void;
  removeSticker: (id: string) => void;
  addOverlay: (overlay: GraphicOverlay) => void;
  updateOverlay: (id: string, patch: Partial<GraphicOverlay>) => void;
  removeOverlay: (id: string) => void;
  addKeyframe: (clipId: string, kf: ZoomKeyframe) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;
  /** Replace a clip's whole keyframe track (auto-reframe, clear). */
  setKeyframes: (clipId: string, kfs: ZoomKeyframe[]) => void;

  setPxPerSec: (v: number) => void;
  setTrackPicking: (v: boolean) => void;

  setExportModalOpen: (v: boolean) => void;
  upsertExportJob: (job: ExportJobInfo) => void;
}

const DEFAULT_FILTERS: VisualFilters = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  backgroundBlur: 24,
  grade: "none",
};

const DEFAULT_AUDIO: AudioSettings = {
  volume: 1,
  noiseReduction: false,
  volumeLeveling: true,
  musicUrl: "",
  musicMediaId: "",
  musicName: "",
  musicVolume: 0.15,
  ducking: true,
};

/** Slice of state covered by undo/redo (creative decisions only). */
interface UndoableSlice {
  transcript: EditorState["transcript"];
  captionLines: EditorState["captionLines"];
  clips: EditorState["clips"];
  captionStyle: EditorState["captionStyle"];
  hookBanner: EditorState["hookBanner"];
  framing: EditorState["framing"];
  filters: EditorState["filters"];
  audio: EditorState["audio"];
  stickers: EditorState["stickers"];
  overlays: EditorState["overlays"];
  keyframesByClip: EditorState["keyframesByClip"];
}

export const useEditorStore = create<EditorState>()(
  temporal(
    persist(
      (set, get) => ({
  source: null,
  ingesting: false,
  ingestError: "",
  transcript: null,
  transcribing: false,
  captionLines: [],
  clips: [],
  detectingClips: false,
  clipFinderSettings: { minDuration: 30, maxDuration: 60, maxClips: 6 },
  selectedClipId: null,

  currentTime: 0,
  playing: false,
  seekVersion: 0,
  seekTime: 0,

  captionStyle: CAPTION_TEMPLATES.reels,
  hookBanner: {
    // Off by default to match the Reels Clean look; one click re-enables.
    enabled: false,
    text: "YOUR HOOK GOES HERE",
    bgColor: "#ffd400",
    textColor: "#000000",
    verticalPosition: 0.09,
  },
  hookBannerEdited: false,
  framing: { mode: "fit-blur", panX: 0, panY: 0, zoom: 1 },
  aspectRatio: "9:16",
  filters: DEFAULT_FILTERS,
  audio: DEFAULT_AUDIO,
  silenceCut: { enabled: false, minGap: 0.6 },
  progressBar: { enabled: false, color: "#7c5cff", thickness: 0.008 },
  stickers: [],
  overlays: [],
  keyframesByClip: {},

  pxPerSec: 12,
  trackPicking: false,

  exportJobs: [],
  exportModalOpen: false,
  detailClipId: null,
  galleryOpen: false,

  setSource: (source) =>
    set({
      source,
      transcript: null,
      captionLines: [],
      clips: [],
      selectedClipId: null,
      currentTime: 0,
      playing: false,
      ingestError: "",
      keyframesByClip: {},
      trackPicking: false,
    }),

  setIngesting: (ingesting, error = "") => set({ ingesting, ingestError: error }),
  setTranscribing: (transcribing) => set({ transcribing }),

  setTranscript: (transcript) =>
    set((s) => ({
      transcript,
      captionLines: transcript
        ? buildCaptionLines(transcript.words, s.captionStyle.maxWordsPerLine)
        : [],
    })),

  updateWordText: (wordId, text) =>
    set((s) => {
      if (!s.transcript) return s;
      const words = s.transcript.words.map((w) =>
        w.id === wordId ? { ...w, text } : w,
      );
      const segments = s.transcript.segments.map((seg) =>
        seg.wordIds.includes(wordId)
          ? {
              ...seg,
              text: words
                .filter((w) => seg.wordIds.includes(w.id))
                .map((w) => w.text)
                .join(" "),
            }
          : seg,
      );
      const transcript = { ...s.transcript, words, segments };
      return {
        transcript,
        captionLines: buildCaptionLines(words, s.captionStyle.maxWordsPerLine),
      };
    }),

  shiftCaptionLine: (lineId, delta) =>
    set((s) => {
      if (!s.transcript) return s;
      const line = s.captionLines.find((l) => l.id === lineId);
      if (!line) return s;
      const ids = new Set(line.words.map((w) => w.id));
      const words = s.transcript.words.map((w) =>
        ids.has(w.id)
          ? { ...w, start: Math.max(0, w.start + delta), end: Math.max(0.05, w.end + delta) }
          : w,
      );
      const transcript = { ...s.transcript, words };
      return {
        transcript,
        captionLines: buildCaptionLines(words, s.captionStyle.maxWordsPerLine),
      };
    }),

  setDetectingClips: (detectingClips) => set({ detectingClips }),
  setClips: (clips) => set({ clips }),
  setClipFinderSettings: (patch) =>
    set((s) => ({ clipFinderSettings: { ...s.clipFinderSettings, ...patch } })),

  selectClip: (clipId) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId) ?? null;
    set({
      selectedClipId: clipId,
      hookBanner:
        clip && !s.hookBannerEdited
          ? { ...s.hookBanner, text: clip.title }
          : s.hookBanner,
    });
    if (clip) get().seekTo(clip.start);
  },

  setClipRange: (clipId, start, end) =>
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId
          ? { ...c, start: Math.max(0, start), end: Math.max(start + 1, end) }
          : c,
      ),
    })),

  addManualClip: () => {
    const s = get();
    if (!s.source) return;
    const start = Math.min(s.currentTime, Math.max(0, s.source.duration - 5));
    const end = Math.min(start + 30, s.source.duration);
    const manualCount = s.clips.filter((c) => c.id.startsWith("manual-")).length;
    const rating = s.transcript
      ? rateClip(s.transcript.segments, start, end)
      : { hook: 50, flow: 50, value: 50, trend: 50 };
    const clip: ClipCandidate = {
      id: `manual-${Date.now()}`,
      title: `CUSTOM CLIP ${manualCount + 1}`,
      start,
      end,
      score: overallScore(rating),
      rating,
      reason: "Created manually",
      sceneAnalysis: s.transcript
        ? sceneAnalysis(s.transcript.segments, start, end)
        : "",
      keywords: [],
    };
    set({ clips: [...s.clips, clip].sort((a, b) => a.start - b.start) });
    get().selectClip(clip.id);
  },

  splitClip: (clipId, at) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === clipId);
      // Both halves must stay usable; refuse razor-thin splits.
      if (!clip || at < clip.start + 3 || at > clip.end - 3) return s;
      const left: ClipCandidate = { ...clip, id: `${clip.id}-a`, end: at };
      const right: ClipCandidate = {
        ...clip,
        id: `${clip.id}-b`,
        title: `${clip.title.replace(/…$/, "")} (2)`.slice(0, 60),
        start: at,
      };
      const cut = at - clip.start;
      const kfs = s.keyframesByClip[clipId] ?? [];
      const keyframesByClip = { ...s.keyframesByClip };
      delete keyframesByClip[clipId];
      if (kfs.length > 0) {
        keyframesByClip[left.id] = kfs.filter((k) => k.time <= cut);
        keyframesByClip[right.id] = kfs
          .filter((k) => k.time > cut)
          .map((k) => ({ ...k, time: k.time - cut }));
      }
      return {
        clips: s.clips
          .flatMap((c) => (c.id === clipId ? [left, right] : [c]))
          .sort((a, b) => a.start - b.start),
        keyframesByClip,
        selectedClipId:
          s.selectedClipId === clipId ? left.id : s.selectedClipId,
      };
    }),

  splitClipAtTimes: (clipId, sourceTimes) =>
    set((s) => {
      const clip = s.clips.find((c) => c.id === clipId);
      if (!clip) return s;
      // Boundaries: clip start, each in-range cut (min 2s apart), clip end.
      const bounds = [clip.start];
      for (const t of [...sourceTimes].sort((a, b) => a - b)) {
        if (t > bounds[bounds.length - 1] + 2 && t < clip.end - 2) bounds.push(t);
      }
      bounds.push(clip.end);
      if (bounds.length <= 2) return s; // no usable cut

      const kfs = s.keyframesByClip[clipId] ?? [];
      const keyframesByClip = { ...s.keyframesByClip };
      delete keyframesByClip[clipId];

      const segments: ClipCandidate[] = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const start = bounds[i];
        const end = bounds[i + 1];
        const id = `${clipId}-s${i}`;
        const rating = s.transcript
          ? rateClip(s.transcript.segments, start, end)
          : clip.rating;
        segments.push({
          ...clip,
          id,
          start,
          end,
          title: i === 0 ? clip.title : `${clip.title.replace(/…$/, "")} (${i + 1})`.slice(0, 60),
          rating,
          score: overallScore(rating),
          sceneAnalysis: s.transcript
            ? sceneAnalysis(s.transcript.segments, start, end)
            : clip.sceneAnalysis,
        });
        const rel = start - clip.start;
        const segKfs = kfs
          .filter((k) => k.time >= rel && k.time < end - clip.start)
          .map((k) => ({ ...k, time: k.time - rel }));
        if (segKfs.length > 0) keyframesByClip[id] = segKfs;
      }

      return {
        clips: s.clips
          .flatMap((c) => (c.id === clipId ? segments : [c]))
          .sort((a, b) => a.start - b.start),
        keyframesByClip,
        selectedClipId:
          s.selectedClipId === clipId ? segments[0].id : s.selectedClipId,
      };
    }),

  restoreProject: (project) => {
    const { state } = project;
    set({
      source: {
        mediaId: project.mediaId,
        previewUrl: `/api/media/${project.mediaId}`,
        name: project.name,
        duration: project.duration,
        width: project.width,
        height: project.height,
        origin: project.origin,
      },
      transcript: state.transcript,
      captionLines: state.transcript
        ? buildCaptionLines(
            state.transcript.words,
            state.captionStyle.maxWordsPerLine,
          )
        : [],
      clips: state.clips,
      selectedClipId: state.selectedClipId,
      captionStyle: state.captionStyle,
      hookBanner: state.hookBanner,
      hookBannerEdited: true, // restored banner text is authoritative
      framing: state.framing,
      // Default grade for projects saved before color grades existed.
      filters: { ...DEFAULT_FILTERS, ...state.filters },
      audio: {
        ...state.audio,
        musicUrl: state.audio.musicMediaId
          ? `/api/media/${state.audio.musicMediaId}`
          : "",
      },
      silenceCut: state.silenceCut ?? get().silenceCut,
      stickers: state.stickers.map((st) => ({ ...st, url: st.dataUrl })),
      keyframesByClip: state.keyframesByClip,
      currentTime: 0,
      playing: false,
      ingesting: false,
      ingestError: "",
      transcribing: false,
      detectingClips: false,
    });
  },

  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaying: (playing) => set({ playing }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  seekTo: (t) =>
    set((s) => ({
      currentTime: t,
      seekTime: t,
      seekVersion: s.seekVersion + 1,
    })),

  applyTemplate: (id) =>
    set((s) => ({
      captionStyle: CAPTION_TEMPLATES[id],
      captionLines: s.transcript
        ? buildCaptionLines(
            s.transcript.words,
            CAPTION_TEMPLATES[id].maxWordsPerLine,
          )
        : s.captionLines,
    })),

  updateCaptionStyle: (patch) =>
    set((s) => {
      const captionStyle = { ...s.captionStyle, ...patch };
      const needRegroup =
        patch.maxWordsPerLine !== undefined &&
        patch.maxWordsPerLine !== s.captionStyle.maxWordsPerLine;
      return {
        captionStyle,
        captionLines:
          needRegroup && s.transcript
            ? buildCaptionLines(s.transcript.words, captionStyle.maxWordsPerLine)
            : s.captionLines,
      };
    }),

  updateHookBanner: (patch) =>
    set((s) => ({
      hookBanner: { ...s.hookBanner, ...patch },
      hookBannerEdited: patch.text !== undefined ? true : s.hookBannerEdited,
    })),

  updateFraming: (patch) => set((s) => ({ framing: { ...s.framing, ...patch } })),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  updateFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  updateAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
  updateSilenceCut: (patch) =>
    set((s) => ({ silenceCut: { ...s.silenceCut, ...patch } })),
  updateProgressBar: (patch) =>
    set((s) => ({ progressBar: { ...s.progressBar, ...patch } })),

  addSticker: (sticker) => set((s) => ({ stickers: [...s.stickers, sticker] })),
  updateSticker: (id, patch) =>
    set((s) => ({
      stickers: s.stickers.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),
  removeSticker: (id) =>
    set((s) => ({ stickers: s.stickers.filter((st) => st.id !== id) })),

  addOverlay: (overlay) => set((s) => ({ overlays: [...s.overlays, overlay] })),
  updateOverlay: (id, patch) =>
    set((s) => ({
      overlays: s.overlays.map((ov) =>
        ov.id === id ? { ...ov, ...patch } : ov,
      ),
    })),
  removeOverlay: (id) =>
    set((s) => ({ overlays: s.overlays.filter((ov) => ov.id !== id) })),

  addKeyframe: (clipId, kf) =>
    set((s) => ({
      keyframesByClip: {
        ...s.keyframesByClip,
        [clipId]: [...(s.keyframesByClip[clipId] ?? []), kf].sort(
          (a, b) => a.time - b.time,
        ),
      },
    })),
  removeKeyframe: (clipId, kfId) =>
    set((s) => ({
      keyframesByClip: {
        ...s.keyframesByClip,
        [clipId]: (s.keyframesByClip[clipId] ?? []).filter((k) => k.id !== kfId),
      },
    })),

  setKeyframes: (clipId, kfs) =>
    set((s) => ({
      keyframesByClip: {
        ...s.keyframesByClip,
        [clipId]: [...kfs].sort((a, b) => a.time - b.time),
      },
    })),

  setPxPerSec: (v) => set({ pxPerSec: clamp(v, 2, 120) }),
  setTrackPicking: (trackPicking) => set({ trackPicking }),

  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),
  setDetailClip: (detailClipId) => set({ detailClipId }),
  setGalleryOpen: (galleryOpen) => set({ galleryOpen }),
  upsertExportJob: (job) =>
    set((s) => {
      const idx = s.exportJobs.findIndex((j) => j.id === job.id);
      if (idx === -1) return { exportJobs: [job, ...s.exportJobs] };
      const exportJobs = s.exportJobs.slice();
      exportJobs[idx] = job;
      return { exportJobs };
    }),
    }),
    {
      // Styling and finder settings survive reloads; media, transcripts,
      // and jobs are session state and are deliberately not persisted.
      name: "clipforge-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Rehydrated manually after mount (StudioShell) so server-rendered
      // HTML always matches the first client render.
      skipHydration: true,
      partialize: (s) => ({
        captionStyle: s.captionStyle,
        clipFinderSettings: s.clipFinderSettings,
        framing: s.framing,
        aspectRatio: s.aspectRatio,
        filters: s.filters,
        silenceCut: s.silenceCut,
        progressBar: s.progressBar,
        hookBanner: {
          enabled: s.hookBanner.enabled,
          bgColor: s.hookBanner.bgColor,
          textColor: s.hookBanner.textColor,
          verticalPosition: s.hookBanner.verticalPosition,
        },
        audio: {
          volume: s.audio.volume,
          noiseReduction: s.audio.noiseReduction,
          volumeLeveling: s.audio.volumeLeveling,
          musicVolume: s.audio.musicVolume,
        },
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<EditorState>;
        return {
          ...current,
          ...p,
          // Deep-merge so snapshots from older versions that lack newer
          // fields (e.g. karaoke/fontWeight) fall back to defaults.
          captionStyle: { ...current.captionStyle, ...p.captionStyle },
          hookBanner: { ...current.hookBanner, ...p.hookBanner },
          audio: { ...current.audio, ...p.audio },
          silenceCut: { ...current.silenceCut, ...p.silenceCut },
          progressBar: { ...current.progressBar, ...p.progressBar },
          overlays: p.overlays ?? current.overlays,
        };
      },
      },
    ),
    {
      limit: 100,
      partialize: (s): UndoableSlice => ({
        transcript: s.transcript,
        captionLines: s.captionLines,
        clips: s.clips,
        captionStyle: s.captionStyle,
        hookBanner: s.hookBanner,
        framing: s.framing,
        filters: s.filters,
        audio: s.audio,
        stickers: s.stickers,
        overlays: s.overlays,
        keyframesByClip: s.keyframesByClip,
      }),
      // Updates are immutable, so reference-shallow equality is exact and
      // cheap; playback ticks (currentTime) never touch these fields, so
      // history only grows on real edits.
      equality: (past, current) =>
        (Object.keys(current) as Array<keyof UndoableSlice>).every(
          (k) => past[k] === current[k],
        ),
      // Group bursts (slider drags, karaoke retimes) into one undo entry.
      handleSet: (handleSet) => {
        let last = 0;
        return (...args: Parameters<typeof handleSet>) => {
          const now = Date.now();
          if (now - last < 350) return;
          last = now;
          handleSet(...args);
        };
      },
    },
  ),
);

/** Imperative undo/redo helpers (also bound to Ctrl/Cmd+Z). */
export function undoEdit() {
  useEditorStore.temporal.getState().undo();
}
export function redoEdit() {
  useEditorStore.temporal.getState().redo();
}
/** Wipe history — called when a brand-new source replaces the session. */
export function clearEditHistory() {
  useEditorStore.temporal.getState().clear();
}

/** The currently selected clip object, or null. */
export function useSelectedClip() {
  return useEditorStore((s) =>
    s.clips.find((c) => c.id === s.selectedClipId) ?? null,
  );
}

// Selectors must return referentially stable snapshots; a fresh `[]` per
// call would loop the useSyncExternalStore render cycle.
const EMPTY_KEYFRAMES: ZoomKeyframe[] = [];

/** Keyframes of the selected clip (stable empty array when none). */
export function useSelectedClipKeyframes() {
  return useEditorStore((s) =>
    s.selectedClipId
      ? s.keyframesByClip[s.selectedClipId] ?? EMPTY_KEYFRAMES
      : EMPTY_KEYFRAMES,
  );
}

/** Interpolated zoom/pan at a clip-relative time from the clip's keyframes. */
export function interpolateKeyframes(
  keyframes: ZoomKeyframe[],
  clipRelativeTime: number,
  base: { zoom: number; panX: number; panY: number },
): { zoom: number; panX: number; panY: number } {
  if (keyframes.length === 0) return base;
  const t = clipRelativeTime;
  if (t <= keyframes[0].time) return keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return last;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = Math.max(b.time - a.time, 1e-6);
      const f = (t - a.time) / span;
      // Smoothstep easing reads far more natural than linear for zooms.
      const e = f * f * (3 - 2 * f);
      return {
        zoom: a.zoom + (b.zoom - a.zoom) * e,
        panX: a.panX + (b.panX - a.panX) * e,
        panY: a.panY + (b.panY - a.panY) * e,
      };
    }
  }
  return base;
}
