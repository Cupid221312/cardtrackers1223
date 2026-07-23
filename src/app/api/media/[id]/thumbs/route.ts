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

const TILE_HEIGHT = 54;
// Enough frames that, stretched across the timeline at the default zoom
// (~12 px/s), each tile lands at roughly its native 16:9 width (~96px at
// 54px tall) instead of a horizontal smear. Bounded for short clips / huge
// VODs. duration/8 ≈ one frame per ~8s ≈ native aspect at default zoom.
function tileCountFor(duration: number): number {
  return Math.max(16, Math.min(300, Math.round(duration / 8)));
}

/**
 * Filmstrip sprite for the timeline's video track: frames sampled evenly
 * across the source (count scales with duration) tiled into one cached JPEG.
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

  let tiles = 60;
  try {
    const { duration } = await probeMedia(mediaPath);
    if (duration && duration > 0) tiles = tileCountFor(duration);
  } catch {
    /* fall back to default tile count */
  }
  // Tile count is baked into the cache name so changing it re-renders.
  const cachePath = path.join(CACHE_DIR, `${params.id}.thumbs${tiles}.jpg`);

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
        `fps=${(tiles / duration).toFixed(6)},scale=-2:${TILE_HEIGHT},tile=${tiles}x1`,
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
