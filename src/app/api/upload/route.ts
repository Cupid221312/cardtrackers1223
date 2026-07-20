import { NextRequest, NextResponse } from "next/server";
import {
  newMediaId,
  probeMedia,
  saveMediaBuffer,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/** Accepts a video or audio file (multipart) and stores it in the media dir. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds 2 GB limit" }, { status: 413 });
    }

    const id = newMediaId();
    const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveMediaBuffer(id, ext, buffer);

    let duration = 0;
    let width = 0;
    let height = 0;
    try {
      const probe = await probeMedia(filePath);
      duration = probe.duration;
      width = probe.width;
      height = probe.height;
    } catch {
      // Audio-only or unprobeable input still gets stored; the client
      // falls back to the <video> element's own metadata.
    }

    return NextResponse.json({ mediaId: id, duration, width, height });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
