"use client";

import { create } from "zustand";
import type {
  AudioSettings,
  CaptionLine,
  CaptionStyle,
  CaptionTemplateId,
  ClipCandidate,
  ClipFinderSettings,
  ExportJobInfo,
  Framing,
  HookBanner,
  SourceMedia,
  Sticker,
  Transcript,
  VisualFilters,
  ZoomKeyframe,
} from "@/lib/types";
import { CAPTION_TEMPLATES } from "@/lib/captionTemplates";
import { buildCaptionLines } from "@/services/ai/captions";
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
  filters: VisualFilters;
  audio: AudioSettings;
  stickers: Sticker[];
  /** Zoom/pan keyframes keyed by clip id (times relative to clip start). */
  keyframesByClip: Record<string, ZoomKeyframe[]>;

  // ---- timeline ------------------------------------------------------------
  pxPerSec: number;

  // ---- export --------------------------------------------------------------
  exportJobs: ExportJobInfo[];
  exportModalOpen: boolean;

  // ---- actions -------------------------------------------------------------
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

  setCurrentTime: (t: number) => void;
  setPlaying: (v: boolean) => void;
  togglePlay: () => void;
  seekTo: (t: number) => void;

  applyTemplate: (id: CaptionTemplateId) => void;
  updateCaptionStyle: (patch: Partial<CaptionStyle>) => void;
  updateHookBanner: (patch: Partial<HookBanner>) => void;
  updateFraming: (patch: Partial<Framing>) => void;
  updateFilters: (patch: Partial<VisualFilters>) => void;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  addSticker: (sticker: Sticker) => void;
  updateSticker: (id: string, patch: Partial<Sticker>) => void;
  removeSticker: (id: string) => void;
  addKeyframe: (clipId: string, kf: ZoomKeyframe) => void;
  removeKeyframe: (clipId: string, kfId: string) => void;

  setPxPerSec: (v: number) => void;

  setExportModalOpen: (v: boolean) => void;
  upsertExportJob: (job: ExportJobInfo) => void;
}

const DEFAULT_FILTERS: VisualFilters = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  backgroundBlur: 24,
};

const DEFAULT_AUDIO: AudioSettings = {
  volume: 1,
  noiseReduction: false,
  volumeLeveling: true,
  musicUrl: "",
  musicMediaId: "",
  musicName: "",
  musicVolume: 0.15,
};

export const useEditorStore = create<EditorState>()((set, get) => ({
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

  captionStyle: CAPTION_TEMPLATES.hormozi,
  hookBanner: {
    enabled: true,
    text: "YOUR HOOK GOES HERE",
    bgColor: "#ffd400",
    textColor: "#000000",
    verticalPosition: 0.09,
  },
  hookBannerEdited: false,
  framing: { mode: "fit-blur", panX: 0, panY: 0, zoom: 1 },
  filters: DEFAULT_FILTERS,
  audio: DEFAULT_AUDIO,
  stickers: [],
  keyframesByClip: {},

  pxPerSec: 12,

  exportJobs: [],
  exportModalOpen: false,

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
  updateFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  updateAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),

  addSticker: (sticker) => set((s) => ({ stickers: [...s.stickers, sticker] })),
  updateSticker: (id, patch) =>
    set((s) => ({
      stickers: s.stickers.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),
  removeSticker: (id) =>
    set((s) => ({ stickers: s.stickers.filter((st) => st.id !== id) })),

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

  setPxPerSec: (v) => set({ pxPerSec: clamp(v, 2, 120) }),

  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),
  upsertExportJob: (job) =>
    set((s) => {
      const idx = s.exportJobs.findIndex((j) => j.id === job.id);
      if (idx === -1) return { exportJobs: [job, ...s.exportJobs] };
      const exportJobs = s.exportJobs.slice();
      exportJobs[idx] = job;
      return { exportJobs };
    }),
}));

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
