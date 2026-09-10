<!-- The block below is Hugging Face Space metadata. It lets you deploy this
     repo to a FREE Hugging Face Docker Space (16 GB RAM — enough to export)
     with no credit card. See DEPLOY.md. It is ignored when running elsewhere. -->
---
title: Clip
emoji: 🎬
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Clip

The streamer-native, chat-aware, **explainable** AI clipper. It turns long
streams and videos into viral-ready vertical clips and, unlike transcript-only
tools, it ranks them by what the audience actually reacted to — then shows its
reasoning. Next.js (App Router), TypeScript, Tailwind, Zustand, FFmpeg.

Installable as a PWA: on a phone the side panels become bottom sheets, and a
link shared from the YouTube or Twitch app imports itself.

## What it does

**AI pipeline**

- **Ingest** a YouTube / Twitch / Kick link or upload an MP4/MOV/WebM. Twitch
  VODs additionally pull **time-aligned chat replay** (no account, no API key),
  cached per media id — the signal the clip finder leads with. Clip streams you
  hold the rights to; the importer says so.
- **Transcribe** with word-level timestamps. The default path needs **no
  account and no install**: a small Whisper model runs in your browser
  (transformers.js, shipped with the app rather than pulled from a CDN). It
  processes in bounded blocks in the background, streaming words in as they
  land, so a long VOD neither blocks the UI nor exhausts memory. Failures name
  the step that failed and offer a retry. `OPENAI_API_KEY` or `GROQ_API_KEY`
  switch to cloud Whisper; with neither, a clearly-labeled demo transcript
  keeps the editor usable.
- **Find viral clips — multi-signal, and it works with no transcript at all.**
  Transcript-only scoring is what every other clipper does, and it falls apart
  on gaming and IRL streams where the best moment is a scream or a clutch play
  rather than a quotable sentence. Clip slides a window across the source,
  measures several independent signal families, normalizes each to a
  **z-score over that specific video** — so a hype streamer and a calm one are
  scored fairly — and fuses them into a 0–100 score:

  - **Chat** *(Twitch VODs — the differentiator)*: message velocity, **distinct
    chatters**, hype-emote and written-laughter rate, copypasta waves, and
    explicit "clip it" requests. The audience already voted on what was funny
    before any model looked at the footage, and this catches highlights the
    streamer stays silent through. Unique-chatter count carries real weight, so
    one person spamming can't outrank a genuine crowd. Chat leads the fusion
    when it's available.
  - **Acoustic**: peak and mean loudness, plus the quiet-then-burst shape that
    marks a classic highlight.
  - **Visual**: scene-cut density via the ffmpeg scene filter.
  - **Language** *(when real words exist)*: hook patterns, sentiment intensity,
    topic shifts, and speech density, scored from a built-in lexicon with no
    model download.

  A placeholder transcript is deliberately **ignored** for scoring — it
  describes a different video, so its timings are fiction — unless it covers
  most of the source, which is how the bundled demo footage still gets real
  phrase titles.

- **Every clip explains itself.** Each candidate carries a per-signal
  breakdown rendered in the gallery, so a score is never an unexplained
  number: *"Chat reaction: 13.9x chat volume, hype emotes spiking, copypasta
  wave, 233 viewers asked to clip it."* Creators trust a ranking they can see
  the reasoning behind, and they learn what makes their content land.

  Four display axes (**Hook / Value / Trend / Flow**, each 0–100) are derived
  from the fused signals and shown as letter grades. With an optional
  `OPENAI_API_KEY` the winners are additionally re-titled by an LLM — but the
  engine above is the contract and runs 100% offline.

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
│     ├─ media/[id]/audio/      # 16 kHz mono WAV for in-browser Whisper
│     ├─ media/[id]/chat/       # cached Twitch chat replay
│     ├─ media/[id]/scenes/     # scene-cut detection (visual signal)
│     └─ media/[id]/waveform/   # decoded peaks (acoustic signal)
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
└─ services/ai/
   ├─ signalClipFinder.ts       # z-score fusion across signal families
   ├─ chatSignals.ts            # chat velocity/emotes/copypasta/callouts
   ├─ browserTranscribe.ts      # in-browser Whisper, block-wise
   └─ clipFinder.ts             # language scoring + routing to the above
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
- Chat replay is implemented for **Twitch VODs**; Kick links import video but
  contribute no chat signal yet, so they fall back to audio and motion.
- Real-time clipping on a live stream is not implemented — finished VODs only.
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
included or copied, so Clip is not a derivative work of it.
