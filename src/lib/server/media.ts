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

const DATA_ROOT = path.join(process.cwd(), ".data");
export const UPLOAD_DIR = path.join(DATA_ROOT, "uploads");
export const EXPORT_DIR = path.join(DATA_ROOT, "exports");

export async function ensureMediaDirs(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(EXPORT_DIR, { recursive: true });
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

export function ffmpegPath(): string {
  if (!ffmpegInstaller?.path)
    throw new Error("No ffmpeg binary available for this platform");
  return ffmpegInstaller.path;
}

export function ffprobePath(): string {
  if (!ffprobeInstaller?.path)
    throw new Error("No ffprobe binary available for this platform");
  return ffprobeInstaller.path;
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
