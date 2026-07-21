import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ffmpegPath,
  findMediaPath,
  isValidMediaId,
} from "@/lib/server/media";
import { spawn } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 180;

const BodySchema = z.object({
  start: z.number().min(0),
  end: z.number().positive(),
  /** Scene-change sensitivity 0..1 (lower = more cuts detected). */
  threshold: z.number().min(0.1).max(0.9).default(0.4),
});

/**
 * Scene / hard-cut detection over a clip range. Technique sourced from
 * OpenMontage's scene_detect (ffmpeg `select='gt(scene,t)'`), reimplemented
 * here: run the select+showinfo filter and parse the pts_time of frames
 * whose scene score exceeds the threshold. Returns cut times relative to
 * the clip start, so the editor can split or snap on real shot changes.
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
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }
  const mediaPath = await findMediaPath(params.id);
  if (!mediaPath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const dur = Math.min(body.end - body.start, 30 * 60);
  try {
    const cuts = await detectCuts(mediaPath, body.start, dur, body.threshold);
    return NextResponse.json({ cuts });
  } catch (err) {
    console.error("[scenes]", err);
    return NextResponse.json({ error: "Scene detection failed" }, { status: 500 });
  }
}

/** Cut timestamps (clip-relative seconds) from the ffmpeg scene filter. */
function detectCuts(
  mediaPath: string,
  start: number,
  dur: number,
  threshold: number,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), [
      "-hide_banner",
      "-ss", start.toFixed(3),
      "-t", dur.toFixed(3),
      "-i", mediaPath,
      "-vf", `select='gt(scene,${threshold})',showinfo`,
      "-f", "null",
      "-",
    ]);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", () => {
      // showinfo logs `pts_time:<seconds>` for each selected (cut) frame.
      const cuts: number[] = [];
      const re = /pts_time:([0-9.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(err)) !== null) {
        const t = parseFloat(m[1]);
        // Merge cuts closer than 0.5s and ignore a cut at t≈0.
        if (t > 0.4 && (cuts.length === 0 || t - cuts[cuts.length - 1] > 0.5)) {
          cuts.push(Math.round(t * 100) / 100);
        }
      }
      resolve(cuts);
    });
  });
}
