# Running & deploying ClipForge Studio

ClipForge renders exports with a real FFmpeg process and stores media on
disk, so it needs a host with a **persistent filesystem and long-running
processes**. It will **not** run on Vercel/Netlify serverless.

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

## Deploy to Render (one click)

`render.yaml` is included. In Render: **New → Blueprint**, point it at this
repo/branch. It provisions a Docker web service with a 10 GB persistent
disk mounted at `/app/.data`. Add `OPENAI_API_KEY` in the dashboard if you
want real transcription. Any Docker-capable host with a persistent disk
works the same way (Railway, Fly.io, a VPS).

## Supported inputs

| Input | Works | Notes |
|-------|-------|-------|
| Upload MP4/MOV/WebM | ✅ | up to 2 GB |
| YouTube link | ✅ | ytdl-core + yt-dlp fallback |
| Twitch VOD / clip | ✅ | needs yt-dlp (bundled in Docker) |
| Kick VOD / clip | ✅ | needs yt-dlp (bundled in Docker) |
| Live streams (ongoing) | ❌ | download a finished VOD instead |
