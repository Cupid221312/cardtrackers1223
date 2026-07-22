<!-- The block below is Hugging Face Space metadata. It lets you deploy this
     repo to a FREE Hugging Face Docker Space (16 GB RAM — enough to export)
     with no credit card. See DEPLOY.md. It is ignored when running elsewhere. -->
---
title: ClipForge Studio
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

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
- **Find viral clips (transparent, credit-free formula)**: a deterministic
  virality model scores every moment and grows the best seeds into
  candidates — **no API key or credits required**. Four axes, each 0–100:
  - **Hook** — pattern hits, a question, and emotional intensity in the
    *first ~3 s* (the scroll-stopper), plus a loud audio start.
  - **Value** — payoff / number / framework language + emotional substance.
  - **Trend** — format & hype patterns + intensity + emphasis + audio energy.
  - **Flow** — pacing *consistency* across segments + a ~38 s length sweet spot.
  - `overall = 0.34·hook + 0.26·value + 0.22·trend + 0.18·flow`, shown as a
    score and letter grade with a plain-English reason.
  Sentiment comes from a tiny built-in lexicon (no model download), and when
  the decoded **audio waveform** is available, loud/hype moments boost the
  score so exciting stream & gaming clips surface even with no keyword hook.
  With an optional `OPENAI_API_KEY` the winners are additionally re-titled and
  re-scored by an LLM — but the formula above is the contract and runs 100%
  offline.

**Editor**

- Central **9:16 canvas** with live hook banner, karaoke captions (active
  word highlighting), draggable stickers/watermarks, and blur-fill or
  crop framing — preview matches the export pixel-for-pixel.
- **Silence removal (jump cuts)**: pauses longer than a tunable threshold
  are detected from word-gap timestamps, skipped live during preview
  playback, marked on the timeline, and cut frame-accurately on export via
  select/aselect compaction — with captions and keyframes remapped onto
  the shortened timeline. The export modal shows the before/after length.
- **Auto punch-in zooms**: one click alternates 1.0×/1.12× zoom per
  caption line for Hormozi-style cut energy (rendered via zoompan).
- **Auto-zoom on energy**: detects the loudest/hype moments from the
  decoded waveform and punches in on each — great for streams where the
  excitement isn't in the words.
- **Aspect ratios**: export **9:16**, **4:5** (IG feed), or **1:1**
  (square) — the preview and the whole render pipeline follow the choice.
- **Auto-duck music**: background music automatically dips under speech
  (FFmpeg sidechaincompress).
- **Cinematic color grades**: one-click looks (Warm, Cool, Vibrant, Moody,
  Vintage, B&W) rendered via FFmpeg colorbalance/curves/eq chains — with
  CSS approximations so the preview matches the burned export. Filter
  recipes sourced from OpenMontage's color-grading skill, reimplemented in
  TypeScript.
- **Progress bar**: an animated bottom bar that fills across the clip
  (retention aid), burned via an ASS `\t` scale animation (reliable across
  FFmpeg builds where drawbox time-expressions are not).
- **Split at scenes**: detects hard cuts across the selected clip
  (FFmpeg `select='gt(scene,t)'`, sourced from OpenMontage's scene_detect)
  and splits the clip into shot-accurate segments in one click.
- **Caption engine** with two rendering modes and five templates:
  - *Phrase mode* — **Reels Clean** (the default) and **Center Burst**:
    sentence-case white phrases that hold on screen between lines —
    Reels Clean wraps 2–3 lines upper-middle (Instagram style), Center
    Burst shows 2-word bold bursts dead-center.
  - *Karaoke mode* — **Hormozi Bold**, **Minimal Karaoke**, **Chip Pop**:
    short word groups with the spoken word highlighted.
  Entrance animations (fade / pop / slide / bounce / reveal — word-by-word)
  render in preview and burned export. **Auto-highlight keywords** (color
  emphasis words/numbers) and **auto-emoji** (drop themed emoji on keywords)
  are one-toggle each. Every field is
  tunable (font size/weight, colors, stroke, position, words per caption,
  highlight on/off). Double-click any transcript word to correct it —
  captions update instantly because they derive from the same word
  objects.
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
- **Click-to-track subject tracking**: drop a dot on any person or object
  in the preview and the 9:16 frame follows it through the clip. Model-free
  template matching (patch SSD, tracked forward and backward from the dot,
  coasting when the subject is briefly lost) generates pan keyframes that
  keep the subject framed. The trajectory is smoothed with a **zero-lag
  centered moving average** and a **stability test** (a near-still subject
  gets one steady framing, not jitter) — techniques adapted from
  OpenMontage's `auto_reframe`, reimplemented independently.
- **Auto-reframe (motion tracking)**: no-dot alternative — the server
  frame-differences a tiny grayscale decode of the clip and pans toward the
  motion, for when you just want the action followed automatically.
- **Undo/redo** across all creative edits (trims, styles, keyframes,
  stickers, transcript corrections) with burst-grouping so slider drags are
  one entry — `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, or the header buttons.
- **Manual clip tools**: create a custom clip window at the playhead
  (`+ Clip`) and split the selected clip in two (`✂ Split` or `S`) — split
  keyframe tracks are divided and re-based automatically. Keyframes show as
  diamond markers on the selected clip block.
- **Keyboard**: `Space` play/pause · `←/→` seek 1 s (`Shift` = 5 s) ·
  `I`/`O` trim in/out to the playhead · `S` split at the playhead · `?`
  opens the shortcut cheat-sheet.
- **Export queue extras**: inline preview player for finished renders, and
  live before/after clip length when jump cuts are active.
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
- Subject tracking uses template matching / motion, not a face model — it
  follows whatever you dot, which also handles objects and products, not
  just faces. A dedicated face detector (e.g. MediaPipe, as OpenMontage's
  `face_tracker` uses) is the natural upgrade for auto-locking onto a
  speaker without a click; it needs a bundled model this environment
  can't fetch.

## Credits

Several trajectory-smoothing and reframing techniques were studied from
[OpenMontage](https://github.com/calesthio/OpenMontage) (AGPLv3) and
**reimplemented independently** in TypeScript — no OpenMontage source is
included or copied, so ClipForge is not a derivative work of it.
