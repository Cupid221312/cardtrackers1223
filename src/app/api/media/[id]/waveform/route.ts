import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  CACHE_DIR,
  ensureMediaDirs,
  findMediaPath,
  isValidMediaId,
  runFfmpegCapture,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 120;

const PEAK_COUNT = 1600;
const SAMPLE_RATE = 4000;

/**
 * Real amplitude envelope for the timeline's audio track: decodes the
 * source to mono 4 kHz s16 PCM, buckets it into PEAK_COUNT normalized
 * peaks, and caches the JSON per media id. Sources with no audio stream
 * return an empty peaks array (the client renders a flat lane).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidMediaId(params.id)) {
    return NextResponse.json({ error: "Bad media id" }, { status: 400 });
  }
  const mediaPath = await findMediaPath(params.id);
  if (!mediaPath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  await ensureMediaDirs();
  const cachePath = path.join(CACHE_DIR, `${params.id}.waveform.json`);
  try {
    const cached = await fs.readFile(cachePath, "utf8");
    return NextResponse.json(JSON.parse(cached));
  } catch {
    // not cached yet
  }

  let peaks: number[] = [];
  try {
    const pcm = await runFfmpegCapture([
      "-v", "error",
      "-i", mediaPath,
      "-map", "a:0",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "s16le",
      "-",
    ]);
    const sampleCount = Math.floor(pcm.length / 2);
    if (sampleCount > 0) {
      const bucketSize = Math.max(1, Math.ceil(sampleCount / PEAK_COUNT));
      const raw: number[] = [];
      for (let start = 0; start < sampleCount; start += bucketSize) {
        let max = 0;
        const end = Math.min(start + bucketSize, sampleCount);
        for (let i = start; i < end; i++) {
          const v = Math.abs(pcm.readInt16LE(i * 2));
          if (v > max) max = v;
        }
        raw.push(max / 32768);
      }
      // Normalize so quiet recordings still draw a readable waveform.
      const globalMax = Math.max(...raw, 0.01);
      peaks = raw.map((v) => Math.round((v / globalMax) * 100) / 100);
    }
  } catch {
    // No audio stream (or decode failure) — flat lane is the right output.
  }

  const body = { peaks };
  await fs
    .writeFile(cachePath, JSON.stringify(body))
    .catch(() => undefined);
  return NextResponse.json(body);
}
