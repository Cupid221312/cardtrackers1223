# Running & deploying ClipForge Studio

ClipForge renders exports with a real FFmpeg process and stores media on
disk, so it needs a host with a **persistent filesystem and long-running
processes**. It will **not** run on Vercel/Netlify serverless.

> **Resource note (matters for quality):** encoding a 1080×1920·60fps clip is
> CPU/RAM heavy. Use an instance with **≥ 2 GB RAM** for reliable exports.
> 512 MB free tiers are fine for browsing/editing but exports may be slow or
> run out of memory.

## Run it locally

```bash
npm install
npm run dev            # http://localhost:3000
```

- Node 20+ only. FFmpeg/ffprobe ship via npm — no system install needed.
- For **Twitch / Kick / YouTube link import**, also install yt-dlp:
  `pip install yt-dlp` (YouTube also has a built-in JS fallback).
- Optional: put `OPENAI_API_KEY=...` in `.env` for real Whisper
  transcription + LLM clip titles. Without it the app runs fully offline
  with a labeled demo transcript.

## Run with Docker (ffmpeg + yt-dlp bundled)

```bash
docker build -t clipforge .
docker run -p 3000:3000 \
  -v clipforge-data:/app/.data \
  -e OPENAI_API_KEY=sk-...  \   # optional
  clipforge
```

The image installs system `ffmpeg` and `yt-dlp`, so uploads, YouTube,
Twitch VODs, and Kick VODs all work out of the box. The `-v` volume keeps
uploads/exports/projects across restarts.

## Deploy to Render (easiest — all in the browser) → public URL

1. Go to **https://render.com**, sign in with GitHub.
2. **New → Blueprint**, pick the repo **`Cupid221312/AiClipping`** — Render
   reads the bundled `render.yaml` automatically.
3. (Optional) add `OPENAI_API_KEY` for real Whisper + AI clip titles.
4. **Apply.** First build ~5–8 min (installs FFmpeg + fonts).
5. You get a URL like **`https://clipforge-studio.onrender.com`** — that's it.

`render.yaml` provisions a Docker web service with a 10 GB persistent disk at
`/app/.data`. Edit `plan:` for a cheaper instance when testing (keep ≥ 2 GB
RAM for exports).

## Deploy to Fly.io (cheapest — one CLI command) → public URL

`fly.toml` is included. From a clone of this repo:

```bash
curl -L https://fly.io/install.sh | sh   # one-time
fly auth login
fly launch --copy-config --now           # builds from Dockerfile + fly.toml
fly secrets set OPENAI_API_KEY=sk-...     # optional
```

Fly prints a URL like **`https://clipforge-studio.fly.dev`**.

Any other Docker-capable host with a persistent disk works the same way
(Railway, a VPS, etc.).

## Supported inputs

| Input | Works | Notes |
|-------|-------|-------|
| Upload MP4/MOV/WebM | ✅ | up to 2 GB |
| YouTube link | ✅ | ytdl-core + yt-dlp fallback |
| Twitch VOD / clip | ✅ | needs yt-dlp (bundled in Docker) |
| Kick VOD / clip | ✅ | needs yt-dlp (bundled in Docker) |
| Live streams (ongoing) | ❌ | download a finished VOD instead |
