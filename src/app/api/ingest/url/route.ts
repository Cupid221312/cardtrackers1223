import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { IngestError, ingestFromUrl } from "@/lib/server/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({ url: z.string().url() });

/** Import a video from a YouTube / Twitch / Kick link. */
export async function POST(req: NextRequest) {
  let url: string;
  try {
    url = BodySchema.parse(await req.json()).url;
  } catch {
    return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
  }

  try {
    const result = await ingestFromUrl(url);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof IngestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ingest/url]", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
