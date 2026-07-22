/**
 * Core domain types shared across the editor UI, AI services, and the
 * FFmpeg export pipeline. All times are seconds relative to the SOURCE
 * video unless a field is explicitly documented otherwise.
 */

import type { ColorGradeId } from "@/lib/colorGrades";
import type { AspectRatio } from "@/lib/aspects";

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

/**
 * Multi-axis virality rating (Opus-style). Each axis is 0..100; the overall
 * `score` is their weighted blend. Letter grades are derived for display.
 */
export interface ClipRating {
  /** Strength of the opening — does it stop the scroll in the first ~3s? */
  hook: number;
  /** Narrative/pacing coherence across the clip. */
  flow: number;
  /** Substance — a payoff, insight, or emotional peak worth watching. */
  value: number;
  /** Alignment with current short-form trends/formats. */
  trend: number;
}

export type LetterGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D";

export interface ClipCandidate {
  id: string;
  /** Punchy title used for the hook banner. */
  title: string;
  start: number;
  end: number;
  /** 0..100 viral-potential score (weighted blend of the rating axes). */
  score: number;
  /** Per-axis rating breakdown. */
  rating: ClipRating;
  /** Human-readable explanation of why this range was picked. */
  reason: string;
  /** One-paragraph description of what happens in the clip (scene analysis). */
  sceneAnalysis: string;
  /** Detected keyword tags for search/filtering. */
  keywords: string[];
}

export interface ClipFinderSettings {
  minDuration: number;
  maxDuration: number;
  maxClips: number;
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

export type CaptionTemplateId =
  | "reels"
  | "burst"
  | "hormozi"
  | "clean"
  | "pop"
  | "kinetic";

/**
 * Caption entrance animation:
 *  none   – appear instantly
 *  fade   – fade in
 *  pop    – scale pop on the highlight / phrase
 *  slide  – slide up into place
 *  bounce – scale overshoot then settle
 *  reveal – karaoke word-by-word (only spoken words shown so far)
 */
export type CaptionAnimation =
  | "none"
  | "fade"
  | "pop"
  | "slide"
  | "bounce"
  | "reveal"
  | "typewriter";

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
  /** Auto-color emphasis words (numbers, power words) in accentColor. */
  highlightKeywords: boolean;
  /** Color used for keyword highlighting. */
  accentColor: string;
  /** Insert a relevant emoji after matched keywords. */
  autoEmoji: boolean;
  /** Alternate word colors between textColor and accentColor. */
  twoTone: boolean;
  /** Solid rounded box behind the caption block ('' = none). */
  boxColor: string;
}

export interface ProgressBarSettings {
  enabled: boolean;
  color: string;
  /** Bar thickness as a fraction of canvas height. */
  thickness: number;
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
  /** One-click cinematic color grade id (see lib/colorGrades). */
  grade: ColorGradeId;
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
  /** Auto-duck the music under speech (FFmpeg sidechaincompress). */
  ducking: boolean;
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
// Animated graphic overlays (motion-graphics library)
// ---------------------------------------------------------------------------

/**
 * A timed motion-graphic drawn over the clip:
 *  notification – a titled card (comment / DM / alert lower-third)
 *  subscribe    – a call-to-action pill button (Subscribe / Follow)
 *  emoji        – a big reaction glyph that floats up and fades
 *  arrow        – a pointer glyph that pops in (rotatable)
 * Each pops/fades in the preview and burns into the export via the ASS track.
 */
export type GraphicOverlayKind =
  | "notification"
  | "subscribe"
  | "emoji"
  | "arrow";

export interface GraphicOverlay {
  id: string;
  kind: GraphicOverlayKind;
  /** Primary text: card title / button label / emoji glyph / arrow glyph. */
  text: string;
  /** Secondary text (notification body); ignored by other kinds. */
  subtext: string;
  /** Center position as fractions of canvas size, 0..1. */
  x: number;
  y: number;
  /** Overall size as a fraction of canvas width. */
  scale: number;
  /** Accent color (card/pill fill, arrow tint). */
  color: string;
  /** Clockwise rotation in degrees (used by the arrow). */
  rotation: number;
  /** SOURCE-time window, seconds (mapped through silence cuts on export). */
  start: number;
  end: number;
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
// Automation: watch creators, auto-clip, auto-publish
// ---------------------------------------------------------------------------

export type SocialPlatform = "youtube" | "tiktok" | "instagram";
export type SourcePlatform = "youtube" | "twitch" | "kick";

/**
 * A stored connection to a publishing platform. Tokens are what the user
 * obtains from that platform's developer console after registering an app
 * and completing OAuth — the app never fabricates them.
 */
export interface PlatformConnection {
  platform: SocialPlatform;
  /** Display handle/name the user connected. */
  account: string;
  /** True once a usable token is stored server-side. */
  connected: boolean;
  updatedAt: number;
}

/**
 * An automation rule: watch a creator on a source platform, auto-clip new
 * VODs above a score threshold, and publish the winners to social targets.
 * A deployed worker polls source platforms and runs these; the app stores
 * and displays them.
 */
export interface AutomationRule {
  id: string;
  enabled: boolean;
  /** Where to watch for new content. */
  sourcePlatform: SourcePlatform;
  /** Creator handle / channel / URL to monitor. */
  creator: string;
  /** Only auto-publish clips scoring at or above this (0..100). */
  minScore: number;
  /** Max clips to publish per new video. */
  maxClipsPerVideo: number;
  captionTemplate: CaptionTemplateId;
  /** Social platforms to publish the winning clips to. */
  publishTo: SocialPlatform[];
  createdAt: number;
  /** Last time the worker acted on this rule (0 = never). */
  lastRunAt: number;
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
    overlays?: GraphicOverlay[];
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
    ducking: boolean;
  };
  stickers: Array<{
    dataUrl: string;
    x: number;
    y: number;
    scale: number;
    opacity: number;
  }>;
  /** Timed motion-graphic overlays burned in via the ASS track. */
  overlays: GraphicOverlay[];
  /**
   * Source-time ranges to KEEP (silence removal). Empty = keep the whole
   * clip. When present, the renderer compacts the timeline and remaps
   * caption/keyframe times accordingly.
   */
  keepSegments: Array<{ start: number; end: number }>;
  progressBar: ProgressBarSettings;
  aspectRatio: AspectRatio;
  sourceWidth: number;
  sourceHeight: number;
}
