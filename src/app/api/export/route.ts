import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ExportRequest } from "@/lib/types";
import { enqueueExport, listJobs } from "@/lib/ffmpeg/exporter";

export const runtime = "nodejs";
export const maxDuration = 600;

const WordSchema = z.object({
  id: z.string(),
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

const ExportSchema = z.object({
  mediaId: z.string().min(1),
  preset: z.enum(["tiktok", "shorts", "reels"]),
  clip: z.object({
    title: z.string(),
    start: z.number().min(0),
    end: z.number().positive(),
  }),
  captions: z.object({
    lines: z.array(
      z.object({
        id: z.string(),
        words: z.array(WordSchema),
        start: z.number(),
        end: z.number(),
      }),
    ),
    style: z.object({
      template: z.enum(["reels", "burst", "hormozi", "clean", "pop", "kinetic"]),
      fontFamily: z.string(),
      fontSize: z.number().min(0.01).max(0.15),
      fontWeight: z.number().min(100).max(1000),
      karaoke: z.boolean(),
      animation: z.enum([
        "none",
        "fade",
        "pop",
        "slide",
        "bounce",
        "reveal",
        "typewriter",
      ]),
      uppercase: z.boolean(),
      textColor: z.string(),
      activeColor: z.string(),
      activeBgColor: z.string(),
      strokeColor: z.string(),
      strokeWidth: z.number().min(0).max(1),
      shadow: z.boolean(),
      verticalPosition: z.number().min(0).max(1),
      maxWordsPerLine: z.number().int().min(1).max(12),
      highlightKeywords: z.boolean(),
      accentColor: z.string(),
      autoEmoji: z.boolean(),
      twoTone: z.boolean(),
      boxColor: z.string(),
    }),
  }),
  hookBanner: z.object({
    enabled: z.boolean(),
    text: z.string().max(200),
    bgColor: z.string(),
    textColor: z.string(),
    verticalPosition: z.number().min(0).max(1),
  }),
  framing: z.object({
    mode: z.enum(["crop", "fit-blur"]),
    panX: z.number().min(-1).max(1),
    panY: z.number().min(-1).max(1),
    zoom: z.number().min(0.5).max(4),
  }),
  filters: z.object({
    brightness: z.number().min(-1).max(1),
    contrast: z.number().min(0).max(3),
    saturation: z.number().min(0).max(3),
    backgroundBlur: z.number().min(0).max(100),
    grade: z.enum(["none", "warm", "cool", "vibrant", "moody", "vintage", "bw"]),
  }),
  keyframes: z.array(
    z.object({
      id: z.string(),
      time: z.number(),
      zoom: z.number(),
      panX: z.number(),
      panY: z.number(),
    }),
  ),
  audio: z.object({
    volume: z.number().min(0).max(4),
    noiseReduction: z.boolean(),
    volumeLeveling: z.boolean(),
    musicMediaId: z.string(),
    musicVolume: z.number().min(0).max(1),
    ducking: z.boolean(),
  }),
  stickers: z.array(
    z.object({
      dataUrl: z.string().max(8_000_000),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      scale: z.number().min(0.01).max(1),
      opacity: z.number().min(0).max(1),
    }),
  ),
  overlays: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["notification", "subscribe", "emoji", "arrow"]),
        text: z.string().max(100),
        subtext: z.string().max(200),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        scale: z.number().min(0.05).max(1),
        color: z.string(),
        rotation: z.number().min(-360).max(360),
        start: z.number().min(0),
        end: z.number().positive(),
      }),
    )
    .max(100),
  keepSegments: z
    .array(z.object({ start: z.number().min(0), end: z.number().positive() }))
    .max(200),
  progressBar: z.object({
    enabled: z.boolean(),
    color: z.string(),
    thickness: z.number().min(0).max(0.1),
  }),
  aspectRatio: z.enum(["9:16", "4:5", "1:1"]),
  sourceWidth: z.number(),
  sourceHeight: z.number(),
});

export async function POST(req: NextRequest) {
  let parsed: ExportRequest;
  try {
    parsed = ExportSchema.parse(await req.json()) as ExportRequest;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? `Invalid export request: ${err.issues[0]?.path.join(".")} ${err.issues[0]?.message}`
            : "Invalid export request",
      },
      { status: 400 },
    );
  }
  if (parsed.clip.end <= parsed.clip.start) {
    return NextResponse.json(
      { error: "Clip end must be after clip start" },
      { status: 400 },
    );
  }
  const job = enqueueExport(parsed);
  return NextResponse.json({ job }, { status: 202 });
}

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
