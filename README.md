# ClipForge Studio

An AI-powered video clipping and editing studio for turning long-form video
into viral-ready vertical clips — in the spirit of Opus Clip and Descript.
Built with Next.js (App Router), TypeScript, Tailwind CSS, Zustand, FFmpeg,
and OpenAI Whisper.

## What it does

**AI pipeline**

- **Ingest** a YouTube URL or upload an MP4/MOV/WebM.
- **Transcribe** with OpenAI Whisper (word-level timestamps). Without an
  `OPENAI_API_KEY` the app stays fully usable offline with a clearly-labeled
  demo transcript.
- **Find viral clips**: deterministic hook/sentiment/topic-change heuristics
  slice the source into 30–60 s candidates with scores and explanations;
  with an API key the winners are re-titled and re-scored by an LLM.

**Editor**

- Central **9:16 canvas** with live hook banner, karaoke captions (active
  word highlighting), draggable stickers/watermarks, and blur-fill or
  crop framing — preview matches the export pixel-for-pixel.
- **Caption engine** with style templates (Hormozi Bold, Minimalist Clean,
  Chip Pop) plus per-field overrides (font size, colors, stroke, position,
  words per line). Double-click any transcript word to correct it — captions
  update instantly because they derive from the same word objects.
- **Multi-track timeline** (video / audio / text) with click-and-drag
  scrubbing, trim handles on the selected clip, drag-to-slide clip windows,
  and drag-to-retime caption lines. Zoomable px-per-second scale, real
  filmstrip thumbnails and a real decoded audio waveform (both generated
  server-side per media and cached), and auto-follow of the playhead during
  playback.
- **Inspector**: brightness/contrast/saturation, background blur, zoom/pan
  with smoothstep-eased keyframes, volume, FFmpeg noise reduction
  (`afftdn`), loudness leveling (`loudnorm` to −14 LUFS), and background
  music with independent gain.
- **Auto-reframe (motion tracking)**: model-free subject tracking — the
  server frame-differences a tiny grayscale decode of the clip, smooths the
  motion centroid with confidence-weighted EMA, and generates pan keyframes
  that follow the action across the frame. One click in the Layout panel.
- **Undo/redo** across all creative edits (trims, styles, keyframes,
  stickers, transcript corrections) with burst-grouping so slider drags are
  one entry — `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, or the header buttons.
- **Manual clip tools**: create a custom clip window at the playhead
  (`+ Clip`) and split the selected clip in two (`✂ Split` or `S`) — split
  keyframe tracks are divided and re-based automatically. Keyframes show as
  diamond markers on the selected clip block.
- **Keyboard**: `Space` play/pause · `←/→` seek 1 s (`Shift` = 5 s) ·
  `I`/`O` trim in/out to the playhead · `S` split at the playhead.
- **Project autosave & restore**: the whole session (transcript, clips,
  styles, stickers, keyframes) autosaves server-side ~2 s after each edit,
  and a Recent Projects list restores everything — including preview
  playback via the stored media — after a reload or on another day.
  Styling defaults also persist in localStorage.
- **Demo footage**: a one-click generated demo video exercises the entire
  pipeline without uploading anything.

**Export**

- **Export Queue** modal renders clips server-side with FFmpeg at
  1080×1920 · 60 fps (H.264 + AAC, `+faststart`) with presets for TikTok,
  YouTube Shorts, and Instagram Reels — one click renders the selected
  clip, or **batch-render every detected clip** (each with its own hook
  title unless you wrote a custom banner). Captions and the hook banner are
  burned in via a generated ASS subtitle track (one dialogue event per word
  for exact karaoke highlighting); zoom/pan keyframes are compiled into
  animated FFmpeg expressions with the same smoothstep easing as the
  preview — pan-only paths (auto-reframe) become an animated `crop` that
  travels the full source width, zoom paths become `zoompan` punch-ins;
  stickers, filters, framing, and the full audio chain are composed in a
  single filter graph. Jobs report live progress parsed from FFmpeg output.

## Getting started

```bash
npm install
cp .env.example .env   # optional: add OPENAI_API_KEY for real Whisper + LLM titles
npm run dev            # http://localhost:3000
```

FFmpeg/ffprobe binaries ship via `@ffmpeg-installer/ffmpeg` /
`@ffprobe-installer/ffprobe` (npm-hosted, no postinstall downloads), so no
system FFmpeg is required.

```bash
npm run test        # vitest unit tests (caption grouping, clip finder, ASS builder)
npm run typecheck   # strict TS
npm run build       # production build
```

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                  # studio entry
│  └─ api/
│     ├─ upload/                # multipart ingest → .data/uploads
│     ├─ ingest/youtube/        # ytdl download + probe
│     ├─ media/[id]/            # Range-aware streaming for <video>
│     ├─ transcribe/            # Whisper (word timestamps) or demo fallback
│     ├─ clips/detect/          # heuristics + optional LLM refinement
│     ├─ projects/              # session autosave: list/save/load/delete
│     ├─ demo/                  # generated demo footage (cached)
│     └─ export/                # job queue: POST create, GET status/download
├─ components/
│  ├─ editor/                   # StudioShell, PreviewCanvas, CaptionOverlay,
│  │                            # HookBannerOverlay, StickerLayer, SourcePanel,
│  │                            # TranscriptPanel, InspectorPanel, ExportQueueModal
│  └─ timeline/                 # Timeline, TimeRuler, Video/Audio/Caption tracks
├─ lib/
│  ├─ store/editorStore.ts      # Zustand: playback, styling, clips, jobs
│  ├─ ffmpeg/                   # ASS subtitle builder + export filter graphs
│  ├─ server/media.ts           # media store, ffprobe, ffmpeg runner
│  └─ types.ts                  # shared domain types
└─ services/ai/                 # transcription, caption grouping, clip finder
```

Design notes:

- **The `<video>` element is the playback clock**; a rAF loop mirrors its
  time into the store, and UI-driven seeks bump a `seekVersion` the player
  responds to. The blur-fill background is a per-frame canvas paint of the
  same element, so it can never drift.
- **Captions are derived state** (`words → lines`) recomputed on transcript
  edits and words-per-line changes, and the same line objects feed both the
  DOM preview and the exported ASS file.
- The **export queue** lives on `globalThis` (survives dev hot reload) and
  runs jobs sequentially; each job gets a temp workdir (ASS file, sticker
  PNGs) that is always cleaned up.

## Current limitations

- YouTube ingest tries `@distube/ytdl-core` first and falls back to a
  system `yt-dlp` binary when present (`pip install yt-dlp`); with neither
  working it degrades to a clear "upload the file instead" error.
- Auto-reframe tracks motion, not faces specifically — on static
  talking-head footage it deliberately stays near center rather than
  chasing noise. A face-detection model is the natural upgrade path.
