import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findMediaPath,
  isValidMediaId,
  probeMedia,
  runFfmpegCapture,
} from "@/lib/server/media";
import {
  pathToKeyframes,
  trackConfidence,
  trackPoint,
} from "@/services/ai/pointTracker";

export const runtime = "nodejs";
export const maxDuration = 300;

const TRACK_W = 192;
const TRACK_H = 108;
const TRACK_FPS = 8;

const BodySchema = z.object({
  start: z.number().min(0),
  end: z.number().positive(),
  /** Source-time where the dot was placed. */
  time: z.number().min(0),
  /** Dot position as fractions of the SOURCE frame, 0..1. */
  point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
});

/**
 * Click-to-track: follows the subject under the user's dot through the
 * clip (template matching, forward + backward from the dot) and returns
 * pan keyframes that keep it centered in the 9:16 crop.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidMediaId(params.id)) {
    return NextResponse.json({ error: "Bad media id" }, { status: 400 });
  }
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
    if (body.end <= body.start) throw new Error("empty range");
  } catch {
    return NextResponse.json(
      { error: "start, end, time, and point are required" },
      { status: 400 },
    );
  }
  const mediaPath = await findMediaPath(params.id);
  if (!mediaPath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    const probe = await probeMedia(mediaPath);
    const duration = Math.min(body.end - body.start, 10 * 60);

    const raw = await runFfmpegCapture([
      "-v", "error",
      "-ss", body.start.toFixed(3),
      "-t", duration.toFixed(3),
      "-i", mediaPath,
      "-vf", `fps=${TRACK_FPS},scale=${TRACK_W}:${TRACK_H},format=gray`,
      "-f", "rawvideo",
      "-",
    ]);
    const frameCount = Math.floor(raw.length / (TRACK_W * TRACK_H));
    if (frameCount < 2) throw new Error("could not decode frames");

    const startFrame = Math.round((body.time - body.start) * TRACK_FPS);
    const points = trackPoint(
      new Uint8Array(raw.buffer, raw.byteOffset, raw.length),
      TRACK_W,
      TRACK_H,
      frameCount,
      startFrame,
      body.point.x,
      body.point.y,
    );

    // Pan gain per axis from the crop slack after cover-scaling to 9:16.
    // gain = 2/(1-r) centers an off-center subject; 0 slack pins the axis.
    const scale = Math.max(1080 / probe.width, 1920 / probe.height);
    const rx = Math.min(1, 1080 / (probe.width * scale));
    const ry = Math.min(1, 1920 / (probe.height * scale));
    const gainX = rx < 0.999 ? 2 / (1 - rx) : 0;
    const gainY = ry < 0.999 ? 2 / (1 - ry) : 0;

    const keyframes = pathToKeyframes(points, TRACK_FPS, gainX, gainY);
    return NextResponse.json({
      keyframes,
      confidence: trackConfidence(points),
    });
  } catch (err) {
    console.error("[track]", err);
    return NextResponse.json(
      { error: "Subject tracking failed for this range" },
      { status: 500 },
    );
  }
}
