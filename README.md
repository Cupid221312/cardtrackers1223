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
- **Keyboard**: `Space` play/pause · `←/→` seek 1 s (`Shift` = 5 s) ·
  `I`/`O` trim the selected clip's in/out point to the playhead.
- Styling and finder settings **persist across reloads** (localStorage);
  media and jobs stay session-scoped.

**Export**

- **Export Queue** modal renders clips server-side with FFmpeg at
  1080×1920 · 60 fps (H.264 + AAC, `+faststart`) with presets for TikTok,
  YouTube Shorts, and Instagram Reels — one click renders the selected
  clip, or **batch-render every detected clip** (each with its own hook
  title unless you wrote a custom banner). Captions and the hook banner are
  burned in via a generated ASS subtitle track (one dialogue event per word
  for exact karaoke highlighting); zoom/pan keyframes are compiled into
  animated `zoompan` expressions with the same smoothstep easing as the
  preview; stickers, filters, framing, and the full audio chain are
  composed in a single filter graph. Jobs report live progress parsed from
  FFmpeg output.

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

- YouTube ingest depends on `@distube/ytdl-core`, which can lag YouTube
  player changes; failures degrade to a clear "upload the file instead"
  error.
- Face-tracking auto-reframe is not implemented; manual pan/zoom framing
  and keyframes are.
