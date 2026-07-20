import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listConnections, listRules, upsertRule } from "@/lib/server/automations";

export const runtime = "nodejs";

const RuleSchema = z.object({
  id: z.string().optional(),
  enabled: z.boolean(),
  sourcePlatform: z.enum(["youtube", "twitch", "kick"]),
  creator: z.string().min(1).max(200),
  minScore: z.number().min(0).max(100),
  maxClipsPerVideo: z.number().int().min(1).max(20),
  captionTemplate: z.enum(["reels", "burst", "hormozi", "clean", "pop"]),
  publishTo: z.array(z.enum(["youtube", "tiktok", "instagram"])),
});

export async function GET() {
  const [rules, connections] = await Promise.all([
    listRules(),
    listConnections(),
  ]);
  return NextResponse.json({ rules, connections });
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof RuleSchema>;
  try {
    body = RuleSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid automation rule" }, { status: 400 });
  }
  const rule = await upsertRule(body);
  return NextResponse.json({ rule });
}
