import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  CACHE_DIR,
  UPLOAD_DIR,
  ensureMediaDirs,
  findMediaPath,
  newMediaId,
  probeMedia,
  runFfmpeg,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEMO_DURATION = 90;

/**
 * Generates (once, then reuses) a synthetic demo video so the whole
 * pipeline can be exercised without uploading anything: animated gradient
 * visuals plus a low sine bed for the audio chain.
 */
export async function POST() {
  await ensureMediaDirs();
  const markerPath = path.join(CACHE_DIR, "demo-media-id.txt");

  try {
    const existingId = (await fs.readFile(markerPath, "utf8")).trim();
    if (existingId && (await findMediaPath(existingId))) {
      return NextResponse.json(await describe(existingId));
    }
  } catch {
    // no demo yet
  }

  const id = newMediaId();
  const filePath = path.join(UPLOAD_DIR, `${id}.mp4`);
  try {
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `testsrc2=size=1280x720:rate=30:duration=${DEMO_DURATION}`,
      "-f", "lavfi",
      "-i", `sine=frequency=196:beep_factor=2:duration=${DEMO_DURATION}`,
      // Heavy blur turns the test pattern into soft drifting color fields —
      // an abstract background that shows off captions and framing.
      "-filter_complex", "[0:v]gblur=sigma=40,eq=saturation=1.5[v];[1:a]volume=0.35[a]",
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      filePath,
    ]);
    await fs.writeFile(markerPath, id);
    return NextResponse.json(await describe(id));
  } catch (err) {
    console.error("[demo]", err);
    await fs.unlink(filePath).catch(() => undefined);
    return NextResponse.json(
      { error: "Could not generate the demo video" },
      { status: 500 },
    );
  }
}

async function describe(mediaId: string) {
  const mediaPath = await findMediaPath(mediaId);
  const probe = mediaPath
    ? await probeMedia(mediaPath)
    : { duration: DEMO_DURATION, width: 1280, height: 720 };
  return {
    mediaId,
    title: "Demo footage",
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
  };
}
