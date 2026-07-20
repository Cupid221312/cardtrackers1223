import { NextRequest, NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import { findMediaPath } from "@/lib/server/media";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
};

/** Streams stored media with HTTP Range support so <video> can scrub. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const filePath = await findMediaPath(params.id);
  if (!filePath) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  const stat = await fs.stat(filePath);
  const ext = filePath.split(".").pop() ?? "";
  const contentType = MIME[ext] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (start >= stat.size || end < start) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    },
  });
}
