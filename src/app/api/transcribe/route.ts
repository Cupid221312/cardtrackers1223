import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findMediaPath } from "@/lib/server/media";
import {
  buildDemoTranscript,
  transcribeWithWhisper,
} from "@/services/ai/transcription";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({ mediaId: z.string().min(1) });

export async function POST(req: NextRequest) {
  let mediaId: string;
  try {
    mediaId = BodySchema.parse(await req.json()).mediaId;
  } catch {
    return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
  }

  const mediaPath = await findMediaPath(mediaId);
  if (!mediaPath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    if (process.env.OPENAI_API_KEY) {
      const transcript = await transcribeWithWhisper(mediaPath);
      return NextResponse.json({ transcript });
    }
    const transcript = await buildDemoTranscript(mediaPath);
    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("[transcribe]", err);
    // Whisper failed (quota, network, oversized) — degrade to the demo
    // transcript rather than dead-ending the editor, and say so.
    try {
      const transcript = await buildDemoTranscript(mediaPath);
      return NextResponse.json({
        transcript,
        warning:
          err instanceof Error
            ? `Whisper failed (${err.message}); using demo transcript.`
            : "Whisper failed; using demo transcript.",
      });
    } catch (fallbackErr) {
      return NextResponse.json(
        {
          error:
            fallbackErr instanceof Error
              ? fallbackErr.message
              : "Transcription failed",
        },
        { status: 500 },
      );
    }
  }
}
