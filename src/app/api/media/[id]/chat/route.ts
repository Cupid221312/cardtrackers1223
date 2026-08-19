import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { isValidMediaId } from "@/lib/server/media";
import { chatPathFor } from "@/lib/server/ingest";

export const runtime = "nodejs";

/**
 * Cached chat replay for a media id, captured at ingest time.
 *
 * Returns an empty list rather than a 404 when there is no chat: uploads and
 * YouTube links have none, and the clip finder treats chat as an optional
 * signal, so "no chat" is a normal answer rather than an error.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidMediaId(params.id)) {
    return NextResponse.json({ error: "Bad media id" }, { status: 400 });
  }
  try {
    const raw = await fs.readFile(chatPathFor(params.id), "utf8");
    const messages = JSON.parse(raw);
    return NextResponse.json({
      messages: Array.isArray(messages) ? messages : [],
    });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
