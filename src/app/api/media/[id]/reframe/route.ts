import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findMediaPath,
  isValidMediaId,
  runFfmpegCapture,
} from "@/lib/server/media";
import {
  centroidsToKeyframes,
  motionCentroids,
  smoothCentroids,
} from "@/services/ai/reframe";

export const runtime = "nodejs";
export const maxDuration = 300;

const ANALYSIS_W = 96;
const ANALYSIS_H = 54;
const ANALYSIS_FPS = 4;

const BodySchema = z.object({
  start: z.number().min(0),
  end: z.number().positive(),
});

/**
 * Motion-based auto-reframe: decodes the clip range to tiny grayscale
 * frames, tracks the motion centroid, and returns clip-relative pan
 * keyframes (zoom 1) ready to drop into the keyframe track.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidMediaId(params.id)) {
    return NextResponse.json({ error: "Bad media id" }, { status: 400 });
  }
  let range: z.infer<typeof BodySchema>;
  try {
    range = BodySchema.parse(await req.json());
    if (range.end <= range.start) throw new Error("empty range");
  } catch {
    return NextResponse.json(
      { error: "start and end (seconds) are required" },
      { status: 400 },
    );
  }
  const mediaPath = await findMediaPath(params.id);
  if (!mediaPath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    const duration = Math.min(range.end - range.start, 15 * 60);
    const raw = await runFfmpegCapture([
      "-v", "error",
      "-ss", range.start.toFixed(3),
      "-t", duration.toFixed(3),
      "-i", mediaPath,
      "-vf", `fps=${ANALYSIS_FPS},scale=${ANALYSIS_W}:${ANALYSIS_H},format=gray`,
      "-f", "rawvideo",
      "-",
    ]);
    const points = motionCentroids(
      new Uint8Array(raw.buffer, raw.byteOffset, raw.length),
      ANALYSIS_W,
      ANALYSIS_H,
      ANALYSIS_FPS,
    );
    const keyframes = centroidsToKeyframes(smoothCentroids(points));
    const totalMotion = points.reduce((sum, p) => sum + p.weight, 0);
    return NextResponse.json({
      keyframes,
      // Callers can tell the user when footage was too static to track.
      confidence: Math.min(1, totalMotion / Math.max(points.length * 0.01, 1e-6)),
    });
  } catch (err) {
    console.error("[reframe]", err);
    return NextResponse.json(
      { error: "Motion analysis failed for this range" },
      { status: 500 },
    );
  }
}
