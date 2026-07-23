import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ClipCandidate, Transcript } from "@/lib/types";
import { findClips } from "@/services/ai/clipFinder";

export const runtime = "nodejs";
export const maxDuration = 120;

const SettingsSchema = z.object({
  minDuration: z.number().min(1).max(600),
  maxDuration: z.number().min(2).max(600),
  maxClips: z.number().int().min(1).max(20),
});

const PeaksSchema = z
  .object({
    peaks: z.array(z.number()).max(20000).optional(),
    peaksDuration: z.number().positive().optional(),
  })
  .optional();

/**
 * Clip detection: deterministic heuristics always run; when OPENAI_API_KEY
 * is present the winners are re-titled/re-scored by an LLM for sharper
 * hooks. The heuristic result is the contract — the LLM only polishes it.
 */
export async function POST(req: NextRequest) {
  let transcript: Transcript;
  let settings: z.infer<typeof SettingsSchema>;
  let audio: z.infer<typeof PeaksSchema>;
  try {
    const body = await req.json();
    transcript = body.transcript as Transcript;
    settings = SettingsSchema.parse(body.settings);
    audio = PeaksSchema.parse(body.audio);
    if (!Array.isArray(transcript?.segments)) throw new Error("bad transcript");
  } catch {
    return NextResponse.json(
      { error: "transcript and settings are required" },
      { status: 400 },
    );
  }

  const clips = findClips(transcript, settings, {
    peaks: audio?.peaks,
    peaksDuration: audio?.peaksDuration,
  });

  if (!process.env.OPENAI_API_KEY || clips.length === 0) {
    return NextResponse.json({ clips });
  }

  try {
    const refined = await refineWithLlm(clips, transcript);
    return NextResponse.json({ clips: refined });
  } catch (err) {
    console.error("[clips/detect] LLM refinement failed:", err);
    return NextResponse.json({ clips });
  }
}

async function refineWithLlm(
  clips: ClipCandidate[],
  transcript: Transcript,
): Promise<ClipCandidate[]> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  const excerpts = clips.map((clip) => ({
    id: clip.id,
    text: transcript.segments
      .filter((s) => s.end > clip.start && s.start < clip.end)
      .map((s) => s.text)
      .join(" ")
      .slice(0, 1200),
  }));

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You title short-form video clips. For each clip excerpt, write a punchy hook title (max 8 words, no quotes, no emojis) and a virality score 1-99. Respond as JSON: {\"clips\":[{\"id\":\"...\",\"title\":\"...\",\"score\":n}]}",
      },
      { role: "user", content: JSON.stringify({ clips: excerpts }) },
    ],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    clips?: Array<{ id: string; title?: string; score?: number }>;
  };
  const byId = new Map((parsed.clips ?? []).map((c) => [c.id, c]));

  return clips.map((clip) => {
    const r = byId.get(clip.id);
    return r
      ? {
          ...clip,
          title: (r.title ?? clip.title).toUpperCase().slice(0, 60),
          score: Math.min(99, Math.max(1, Math.round(r.score ?? clip.score))),
          reason: `${clip.reason} · AI-refined`,
        }
      : clip;
  });
}
