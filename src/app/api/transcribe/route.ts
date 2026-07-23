import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findMediaPath } from "@/lib/server/media";
import {
  buildDemoTranscript,
  transcribeLocal,
  transcribeWithWhisper,
  transcribeWithWhisperCli,
} from "@/services/ai/transcription";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({ mediaId: z.string().min(1) });

/** Reject a promise if it doesn't settle within `ms` (guards against hangs). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("transcription timed out")), ms),
    ),
  ]);
}

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
    // 1) Paid OpenAI Whisper if a key is configured (fast, most accurate).
    if (process.env.OPENAI_API_KEY) {
      const transcript = await transcribeWithWhisper(mediaPath);
      return NextResponse.json({ transcript });
    }
    // 2) Free local speech-to-text. Prefer the official Whisper CLI
    //    (pip install -U openai-whisper), then the transformers.js engine.
    if (process.env.DISABLE_LOCAL_STT !== "1") {
      // 2a) Whisper CLI
      try {
        const transcript = await transcribeWithWhisperCli(mediaPath);
        return NextResponse.json({ transcript });
      } catch (cliErr) {
        console.error("[transcribe] whisper CLI unavailable:", cliErr);
      }
      // 2b) transformers.js (guarded so it can never hang the request forever)
      try {
        const transcript = await withTimeout(
          transcribeLocal(mediaPath),
          10 * 60 * 1000,
        );
        return NextResponse.json({ transcript });
      } catch (localErr) {
        console.error("[transcribe] transformers.js STT unavailable:", localErr);
      }
      // 2c) Fall back to the labeled demo transcript with guidance.
      const transcript = await buildDemoTranscript(mediaPath);
      return NextResponse.json({
        transcript,
        warning:
          "No real transcription engine found. Install it with `pip install -U openai-whisper` (plus ffmpeg on PATH), then re-transcribe. Showing a placeholder transcript for now.",
      });
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
