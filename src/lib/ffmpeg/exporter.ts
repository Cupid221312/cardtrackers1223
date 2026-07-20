import { promises as fs } from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { ExportJobInfo, ExportPreset, ExportRequest } from "@/lib/types";
import { buildAssDocument } from "@/lib/ffmpeg/ass";
import { animatedCropFilter, zoompanFilter } from "@/lib/ffmpeg/keyframes";
import {
  EXPORT_DIR,
  ensureMediaDirs,
  findMediaPath,
  runFfmpeg,
} from "@/lib/server/media";

/**
 * In-process export queue. Jobs run one at a time (ffmpeg saturates the
 * box anyway); state lives on globalThis so Next.js dev-mode module
 * reloads don't orphan running jobs.
 */

const OUT_W = 1080;
const OUT_H = 1920;
const OUT_FPS = 60;

const PRESETS: Record<ExportPreset, { crf: number; audioKbps: number; label: string }> = {
  tiktok: { crf: 20, audioKbps: 192, label: "TikTok" },
  shorts: { crf: 18, audioKbps: 192, label: "YouTube Shorts" },
  reels: { crf: 20, audioKbps: 128, label: "Instagram Reels" },
};

interface JobRecord {
  info: ExportJobInfo;
  request: ExportRequest;
}

interface QueueState {
  jobs: Map<string, JobRecord>;
  running: boolean;
}

const globalState = globalThis as unknown as { __clipforgeQueue?: QueueState };

function queue(): QueueState {
  if (!globalState.__clipforgeQueue) {
    globalState.__clipforgeQueue = { jobs: new Map(), running: false };
  }
  return globalState.__clipforgeQueue;
}

export function getJob(id: string): ExportJobInfo | null {
  return queue().jobs.get(id)?.info ?? null;
}

export function listJobs(): ExportJobInfo[] {
  return [...queue().jobs.values()]
    .map((j) => j.info)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function enqueueExport(request: ExportRequest): ExportJobInfo {
  const id = crypto.randomUUID();
  const info: ExportJobInfo = {
    id,
    clipTitle: request.clip.title,
    preset: request.preset,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
  };
  queue().jobs.set(id, { info, request });
  void pump();
  return info;
}

async function pump(): Promise<void> {
  const q = queue();
  if (q.running) return;
  const next = [...q.jobs.values()].find((j) => j.info.status === "queued");
  if (!next) return;
  q.running = true;
  try {
    await runJob(next);
  } finally {
    q.running = false;
    void pump();
  }
}

async function runJob(job: JobRecord): Promise<void> {
  const { info, request } = job;
  info.status = "processing";
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "clipforge-export-"));
  try {
    const sourcePath = await findMediaPath(request.mediaId);
    if (!sourcePath) throw new Error("Source media no longer exists on the server");
    await ensureMediaDirs();

    const clipDur = request.clip.end - request.clip.start;
    if (clipDur <= 0.5) throw new Error("Clip is too short to export");

    // --- side files ------------------------------------------------------
    const assPath = path.join(workDir, "captions.ass");
    await fs.writeFile(
      assPath,
      buildAssDocument({
        lines: request.captions.lines,
        style: request.captions.style,
        banner: request.hookBanner,
        clipStart: request.clip.start,
        clipEnd: request.clip.end,
      }),
    );

    const stickerPaths: string[] = [];
    for (const [i, sticker] of request.stickers.entries()) {
      const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(sticker.dataUrl);
      if (!m) continue;
      const p = path.join(workDir, `sticker-${i}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
      await fs.writeFile(p, Buffer.from(m[2], "base64"));
      stickerPaths.push(p);
    }

    const musicPath = request.audio.musicMediaId
      ? await findMediaPath(request.audio.musicMediaId)
      : null;

    const outPath = path.join(EXPORT_DIR, `${info.id}.mp4`);
    const args = buildArgs({
      request,
      sourcePath,
      assPath,
      stickerPaths,
      musicPath,
      outPath,
    });

    const timeRe = /time=(\d+):(\d+):(\d+)\.(\d+)/;
    await runFfmpeg(args, (line) => {
      const m = timeRe.exec(line);
      if (m) {
        const t = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
        info.progress = Math.min(0.99, t / clipDur);
      }
    });

    info.progress = 1;
    info.status = "done";
    info.outputUrl = `/api/export/${info.id}/download`;
  } catch (err) {
    info.status = "error";
    info.error = err instanceof Error ? err.message : "Export failed";
    console.error(`[export ${info.id}]`, err);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Escape a path for use inside an ffmpeg filter argument. */
function filterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function buildArgs(opts: {
  request: ExportRequest;
  sourcePath: string;
  assPath: string;
  stickerPaths: string[];
  musicPath: string | null;
  outPath: string;
}): string[] {
  const { request, sourcePath, assPath, stickerPaths, musicPath, outPath } = opts;
  const { filters, audio, clip, preset } = request;
  const clipDur = clip.end - clip.start;
  const p = PRESETS[preset];

  // With keyframes, framing animates (keyframes replace base framing,
  // matching the preview) and the static framing step runs at zoom=1 /
  // no pan. Pan-only crop keyframes (auto-reframe) use an animated crop
  // across the full source; anything with zoom animation uses zoompan on
  // the composed 9:16 stream.
  const animated = request.keyframes.length > 0;
  const panOnlyCrop =
    animated &&
    request.framing.mode === "crop" &&
    request.keyframes.every((k) => k.zoom === 1);
  const framing = animated
    ? { ...request.framing, zoom: 1, panX: 0, panY: 0 }
    : request.framing;

  const args: string[] = [
    "-ss", clip.start.toFixed(3),
    "-t", clipDur.toFixed(3),
    "-i", sourcePath,
  ];
  const stickersBase = 1;
  for (const sp of stickerPaths) args.push("-i", sp);
  const musicIndex = stickersBase + stickerPaths.length;
  if (musicPath) args.push("-stream_loop", "-1", "-i", musicPath);

  // ---- video graph ------------------------------------------------------
  const eq = `eq=brightness=${filters.brightness.toFixed(3)}:contrast=${filters.contrast.toFixed(3)}:saturation=${filters.saturation.toFixed(3)}`;
  const chains: string[] = [];

  if (framing.mode === "fit-blur") {
    const fgW = Math.round((OUT_W * framing.zoom) / 2) * 2;
    const blurSigma = Math.max(0, filters.backgroundBlur / 2);
    chains.push(
      `[0:v]split=2[bgsrc][fgsrc]`,
      `[bgsrc]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},gblur=sigma=${blurSigma.toFixed(1)},eq=brightness=-0.08:saturation=0.85[bg]`,
      `[fgsrc]scale=${fgW}:-2,${eq}[fg]`,
      `[bg][fg]overlay=x=(W-w)/2-(${(framing.panX * 0.12).toFixed(4)}*W):y=(H-h)/2-(${(framing.panY * 0.12).toFixed(4)}*H)[framed]`,
    );
  } else if (panOnlyCrop) {
    // Cover-scale without cropping, then pan an animated 1080x1920 crop
    // window across the whole frame following the keyframe path.
    chains.push(
      `[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,` +
        `${animatedCropFilter(request.keyframes, OUT_W, OUT_H)},${eq}[framed]`,
    );
  } else {
    // Cover-crop: upscale so the frame is filled at the requested zoom,
    // then crop a 1080x1920 window offset by the pan.
    chains.push(
      `[0:v]scale=w=${OUT_W}*${framing.zoom.toFixed(3)}:h=${OUT_H}*${framing.zoom.toFixed(3)}:force_original_aspect_ratio=increase,` +
        `crop=${OUT_W}:${OUT_H}:` +
        `x='(iw-${OUT_W})/2+${(framing.panX / 2).toFixed(4)}*(iw-${OUT_W})':` +
        `y='(ih-${OUT_H})/2+${(framing.panY / 2).toFixed(4)}*(ih-${OUT_H})',` +
        `${eq}[framed]`,
    );
  }

  let vLabel = "framed";
  if (animated && !panOnlyCrop) {
    // Constant 60fps in, one output frame per input frame — `on/60` is
    // wall time, which the keyframe expressions expect.
    chains.push(
      `[${vLabel}]fps=${OUT_FPS},${zoompanFilter(request.keyframes, OUT_W, OUT_H, OUT_FPS)}[zoomed]`,
    );
    vLabel = "zoomed";
  }
  request.stickers.forEach((sticker, i) => {
    if (i >= stickerPaths.length) return;
    const w = Math.max(16, Math.round(sticker.scale * OUT_W));
    const next = `stk${i}`;
    chains.push(
      `[${stickersBase + i}:v]scale=${w}:-1,format=rgba,colorchannelmixer=aa=${sticker.opacity.toFixed(2)}[si${i}]`,
      `[${vLabel}][si${i}]overlay=x=${Math.round(sticker.x * OUT_W)}-w/2:y=${Math.round(sticker.y * OUT_H)}-h/2[${next}]`,
    );
    vLabel = next;
  });

  chains.push(
    `[${vLabel}]subtitles='${filterPath(assPath)}',fps=${OUT_FPS},format=yuv420p[vout]`,
  );

  // ---- audio graph ------------------------------------------------------
  const aFilters: string[] = [`volume=${audio.volume.toFixed(2)}`];
  if (audio.noiseReduction) aFilters.push("afftdn=nf=-28");
  if (audio.volumeLeveling) aFilters.push("loudnorm=I=-14:TP=-1.5:LRA=11");
  chains.push(`[0:a]${aFilters.join(",")}[a0]`);
  let aLabel = "a0";
  if (musicPath) {
    chains.push(
      `[${musicIndex}:a]volume=${audio.musicVolume.toFixed(2)},atrim=0:${clipDur.toFixed(3)}[am]`,
      `[a0][am]amix=inputs=2:duration=first:normalize=0[aout]`,
    );
    aLabel = "aout";
  }

  args.push(
    "-filter_complex", chains.join(";"),
    "-map", "[vout]",
    "-map", `[${aLabel}]`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", String(p.crf),
    "-r", String(OUT_FPS),
    "-c:a", "aac",
    "-b:a", `${p.audioKbps}k`,
    "-movflags", "+faststart",
    "-t", clipDur.toFixed(3),
    outPath,
  );
  return args;
}

export function exportOutputPath(jobId: string): string {
  return path.join(EXPORT_DIR, `${jobId}.mp4`);
}
