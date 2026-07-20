/**
 * Core domain types shared across the editor UI, AI services, and the
 * FFmpeg export pipeline. All times are seconds relative to the SOURCE
 * video unless a field is explicitly documented otherwise.
 */

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface Word {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  wordIds: string[];
}

export interface Transcript {
  words: Word[];
  segments: TranscriptSegment[];
  language: string;
  /** 'whisper' = real OpenAI Whisper output; 'mock' = offline placeholder */
  source: "whisper" | "mock";
}

/** A renderable caption line: a small group of words shown together. */
export interface CaptionLine {
  id: string;
  words: Word[];
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// AI clip detection
// ---------------------------------------------------------------------------

export interface ClipCandidate {
  id: string;
  /** Punchy title used for the hook banner. */
  title: string;
  start: number;
  end: number;
  /** 0..100 viral-potential score. */
  score: number;
  /** Human-readable explanation of why this range was picked. */
  reason: string;
}

export interface ClipFinderSettings {
  minDuration: number;
  maxDuration: number;
  maxClips: number;
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

export type CaptionTemplateId = "reels" | "burst" | "hormozi" | "clean" | "pop";

/** Entrance animation: phrase fade-in, or per-word pop on the highlight. */
export type CaptionAnimation = "none" | "fade" | "pop";

export interface SilenceCutSettings {
  enabled: boolean;
  /** Pauses longer than this many seconds get jump-cut. */
  minGap: number;
}

export interface CaptionStyle {
  template: CaptionTemplateId;
  fontFamily: string;
  /** Font size as a fraction of canvas height (resolution independent). */
  fontSize: number;
  /** CSS font weight (400–900); maps to the ASS bold flag on export. */
  fontWeight: number;
  /**
   * true  = karaoke mode: short word groups, active word highlighted.
   * false = phrase mode: whole sentences wrap over 2–3 centered lines and
   *         hold on screen between phrases (Instagram Reels style).
   */
  karaoke: boolean;
  animation: CaptionAnimation;
  uppercase: boolean;
  textColor: string;
  activeColor: string;
  /** Optional solid chip behind the active word ('' = none). */
  activeBgColor: string;
  strokeColor: string;
  /** Stroke width as a fraction of font size. */
  strokeWidth: number;
  shadow: boolean;
  /** Vertical anchor of the caption block, 0 = top, 1 = bottom. */
  verticalPosition: number;
  maxWordsPerLine: number;
}

export interface HookBanner {
  enabled: boolean;
  text: string;
  bgColor: string;
  textColor: string;
  /** Vertical anchor 0..1 from the top of the canvas. */
  verticalPosition: number;
}

// ---------------------------------------------------------------------------
// Framing, filters, keyframes
// ---------------------------------------------------------------------------

export type FramingMode = "crop" | "fit-blur";

export interface Framing {
  mode: FramingMode;
  /** Horizontal pan of the crop window, -1 (far left) .. 1 (far right). */
  panX: number;
  panY: number;
  /** Additional zoom on top of the base 9:16 crop, 1 = none. */
  zoom: number;
}

export interface ZoomKeyframe {
  id: string;
  /** Seconds relative to the CLIP start. */
  time: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface VisualFilters {
  /** -1..1, 0 = neutral */
  brightness: number;
  /** 0..2, 1 = neutral */
  contrast: number;
  /** 0..2, 1 = neutral */
  saturation: number;
  /** Blur radius for the fit-blur background layer, in px at 1080p. */
  backgroundBlur: number;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface AudioSettings {
  /** 0..2 linear gain on the source audio. */
  volume: number;
  noiseReduction: boolean;
  /** Normalize loudness on export (FFmpeg loudnorm). */
  volumeLeveling: boolean;
  /** Object URL (preview) of an uploaded background track, '' = none. */
  musicUrl: string;
  /** Server media id of the uploaded background track, '' = none. */
  musicMediaId: string;
  musicName: string;
  /** 0..1 gain applied to the background track. */
  musicVolume: number;
}

// ---------------------------------------------------------------------------
// Stickers / branding
// ---------------------------------------------------------------------------

export interface Sticker {
  id: string;
  name: string;
  /** Object URL for preview rendering. */
  url: string;
  /** Data URL kept for export so the server can rebuild the image. */
  dataUrl: string;
  /** Center position as fractions of canvas size, 0..1. */
  x: number;
  y: number;
  /** Width as a fraction of canvas width. */
  scale: number;
  opacity: number;
}

// ---------------------------------------------------------------------------
// Source media
// ---------------------------------------------------------------------------

export interface SourceMedia {
  /** Server-side media id (uploads + YouTube ingests are stored on disk). */
  mediaId: string;
  /** URL the <video> element plays: object URL or /api/media/[id]. */
  previewUrl: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  origin: "upload" | "youtube";
}

// ---------------------------------------------------------------------------
// Projects (server-side session persistence)
// ---------------------------------------------------------------------------

/** Everything needed to restore an editing session, keyed by media id. */
export interface SavedProject {
  mediaId: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  origin: "upload" | "youtube";
  savedAt: number;
  state: {
    transcript: Transcript | null;
    clips: ClipCandidate[];
    selectedClipId: string | null;
    captionStyle: CaptionStyle;
    hookBanner: HookBanner;
    framing: Framing;
    filters: VisualFilters;
    /** musicUrl is a blob URL and is rebuilt from musicMediaId on restore. */
    audio: Omit<AudioSettings, "musicUrl">;
    silenceCut?: SilenceCutSettings;
    /** Sticker preview urls are rebuilt from their data URLs on restore. */
    stickers: Array<Omit<Sticker, "url">>;
    keyframesByClip: Record<string, ZoomKeyframe[]>;
  };
}

export interface SavedProjectSummary {
  mediaId: string;
  name: string;
  duration: number;
  savedAt: number;
  clipCount: number;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportPreset = "tiktok" | "shorts" | "reels";

export type ExportStatus = "queued" | "processing" | "done" | "error";

export interface ExportJobInfo {
  id: string;
  clipTitle: string;
  preset: ExportPreset;
  status: ExportStatus;
  /** 0..1 */
  progress: number;
  outputUrl?: string;
  error?: string;
  createdAt: number;
}

/** Everything the server needs to render one clip. */
export interface ExportRequest {
  mediaId: string;
  preset: ExportPreset;
  clip: { title: string; start: number; end: number };
  captions: {
    lines: CaptionLine[];
    style: CaptionStyle;
  };
  hookBanner: HookBanner;
  framing: Framing;
  filters: VisualFilters;
  keyframes: ZoomKeyframe[];
  audio: {
    volume: number;
    noiseReduction: boolean;
    volumeLeveling: boolean;
    musicMediaId: string;
    musicVolume: number;
  };
  stickers: Array<{
    dataUrl: string;
    x: number;
    y: number;
    scale: number;
    opacity: number;
  }>;
  /**
   * Source-time ranges to KEEP (silence removal). Empty = keep the whole
   * clip. When present, the renderer compacts the timeline and remaps
   * caption/keyframe times accordingly.
   */
  keepSegments: Array<{ start: number; end: number }>;
  sourceWidth: number;
  sourceHeight: number;
}
