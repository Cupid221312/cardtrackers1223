import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

/**
 * Local media store for uploads, YouTube ingests, and rendered exports.
 * Files live under .data/ (gitignored); ids are UUIDs and the extension is
 * preserved so ffmpeg/ffprobe can sniff container formats.
 */

// DATA_DIR lets hosts that run as a non-root user (e.g. Hugging Face Spaces)
// point storage at a writable path like /data or /tmp.
const DATA_ROOT = process.env.DATA_DIR || path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_ROOT, "uploads");
export const EXPORT_DIR = path.join(DATA_ROOT, "exports");
/** Derived artifacts (waveform peaks, filmstrip thumbnails). Kept separate
 *  from UPLOAD_DIR so findMediaPath's `${id}.` prefix scan can't match them. */
export const CACHE_DIR = path.join(DATA_ROOT, "cache");

export async function ensureMediaDirs(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export function newMediaId(): string {
  return crypto.randomUUID();
}

/** Reject anything that is not a bare UUID (defends the path join below). */
export function isValidMediaId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function saveMediaBuffer(
  id: string,
  ext: string,
  data: Buffer,
): Promise<string> {
  await ensureMediaDirs();
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const filePath = path.join(UPLOAD_DIR, `${id}.${safeExt}`);
  await fs.writeFile(filePath, data);
  return filePath;
}

/** Resolve a media id to its on-disk path, or null. */
export async function findMediaPath(id: string): Promise<string | null> {
  if (!isValidMediaId(id)) return null;
  await ensureMediaDirs();
  const entries = await fs.readdir(UPLOAD_DIR);
  const match = entries.find((f) => f.startsWith(`${id}.`));
  return match ? path.join(UPLOAD_DIR, match) : null;
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe binaries
// ---------------------------------------------------------------------------

/**
 * Resolve the ffmpeg/ffprobe binaries. Priority:
 *   1. FFMPEG_PATH / FFPROBE_PATH env (set in Docker to the system build).
 *   2. the npm installer package (works out of the box for `npm run dev`).
 *   3. bare `ffmpeg` / `ffprobe` on PATH.
 * Next.js `output: standalone` doesn't always trace the installer's
 * platform binary, so the env/PATH fallbacks keep exports working in
 * containers where a system ffmpeg is present.
 */
export function ffmpegPath(): string {
  return process.env.FFMPEG_PATH || ffmpegInstaller?.path || "ffmpeg";
}

export function ffprobePath(): string {
  return process.env.FFPROBE_PATH || ffprobeInstaller?.path || "ffprobe";
}

export interface MediaProbe {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Probe duration/dimensions with ffprobe (JSON output). */
export function probeMedia(filePath: string): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath(), [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (${code}): ${err.slice(0, 400)}`));
        return;
      }
      try {
        const json = JSON.parse(out);
        const streams: Array<Record<string, unknown>> = json.streams ?? [];
        const video = streams.find((s) => s.codec_type === "video");
        const audio = streams.find((s) => s.codec_type === "audio");
        resolve({
          duration: Number(json.format?.duration ?? 0),
          width: Number(video?.width ?? 0),
          height: Number(video?.height ?? 0),
          hasAudio: Boolean(audio),
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Run ffmpeg and capture bounded stdout (e.g. raw PCM for waveforms). */
export function runFfmpegCapture(
  args: string[],
  maxBytes = 128 * 1024 * 1024,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", ...args]);
    const chunks: Buffer[] = [];
    let total = 0;
    let errTail = "";
    proc.stdout.on("data", (d: Buffer) => {
      total += d.length;
      if (total > maxBytes) {
        proc.kill("SIGKILL");
        reject(new Error("ffmpeg output exceeded capture limit"));
        return;
      }
      chunks.push(d);
    });
    proc.stderr.on("data", (d: Buffer) => {
      errTail = (errTail + d.toString()).slice(-2000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with ${code}: …${errTail.slice(-400)}`));
    });
  });
}

/** Run ffmpeg with args; resolves on exit 0, rejects with stderr tail. */
export function runFfmpeg(
  args: string[],
  onStderrLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-y", ...args]);
    let tail = "";
    proc.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      tail = (tail + text).slice(-4000);
      if (onStderrLine) {
        for (const line of text.split(/\r|\n/)) {
          if (line.trim()) onStderrLine(line);
        }
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: …${tail.slice(-600)}`));
    });
  });
}
