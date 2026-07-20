import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import {
  CACHE_DIR,
  ensureMediaDirs,
  findMediaPath,
  isValidMediaId,
  probeMedia,
  runFfmpeg,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 120;

const TILE_COUNT = 20;
const TILE_HEIGHT = 54;

/**
 * Filmstrip sprite for the timeline's video track: TILE_COUNT frames
 * sampled evenly across the source, tiled into one cached JPEG strip.
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
  const cachePath = path.join(CACHE_DIR, `${params.id}.thumbs.jpg`);

  try {
    await fs.access(cachePath);
  } catch {
    try {
      const { duration } = await probeMedia(mediaPath);
      if (!duration || duration <= 0) throw new Error("no duration");
      // fps = tiles/duration samples evenly; tile pads any short remainder.
      await runFfmpeg([
        "-v", "error",
        "-i", mediaPath,
        "-vf",
        `fps=${(TILE_COUNT / duration).toFixed(6)},scale=-2:${TILE_HEIGHT},tile=${TILE_COUNT}x1`,
        "-frames:v", "1",
        "-q:v", "5",
        cachePath,
      ]);
    } catch (err) {
      console.error("[thumbs]", err);
      return NextResponse.json(
        { error: "Could not generate thumbnails" },
        { status: 500 },
      );
    }
  }

  const stat = await fs.stat(cachePath);
  return new NextResponse(
    createReadStream(cachePath) as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    },
  );
}
