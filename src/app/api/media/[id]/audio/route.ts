import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import {
  CACHE_DIR,
  ensureMediaDirs,
  findMediaPath,
  isValidMediaId,
  runFfmpeg,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 16 kHz mono WAV of the source audio, for in-browser transcription: the
 * client fetches this, decodes it with the Web Audio API, and runs Whisper
 * (transformers.js) locally. Cached per media id.
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
  const cachePath = path.join(CACHE_DIR, `${params.id}.16k.wav`);
  try {
    await fs.access(cachePath);
  } catch {
    try {
      await runFfmpeg([
        "-v", "error",
        "-i", mediaPath,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        cachePath,
      ]);
    } catch (err) {
      console.error("[audio]", err);
      return NextResponse.json(
        { error: "Could not extract audio" },
        { status: 500 },
      );
    }
  }

  const stat = await fs.stat(cachePath);
  return new NextResponse(
    createReadStream(cachePath) as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    },
  );
}
