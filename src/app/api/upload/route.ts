import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import {
  newMediaId,
  probeMedia,
  saveMediaBuffer,
  saveMediaStream,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Accepts a video/audio file and stores it in the media dir.
 *
 * Preferred path: the client sends the raw file as the request body with an
 * `x-filename` header — the body is streamed straight to disk (no buffering),
 * so multi-GB / long videos upload fast and don't exhaust memory.
 *
 * Fallback: a classic multipart/form-data POST is still accepted (buffered),
 * for any caller that doesn't set x-filename.
 */
export async function POST(req: NextRequest) {
  try {
    const filename = req.headers.get("x-filename");
    const contentType = req.headers.get("content-type") ?? "";

    // ---- streaming path (raw body) ----
    if (filename && !contentType.startsWith("multipart/form-data")) {
      const declared = Number(req.headers.get("content-length") ?? 0);
      if (declared && declared > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "File exceeds 5 GB limit" }, { status: 413 });
      }
      if (!req.body) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const id = newMediaId();
      const ext = (filename.split(".").pop() ?? "mp4").toLowerCase();
      const { filePath, bytes } = await saveMediaStream(id, ext, req.body);
      if (bytes === 0) {
        await fs.unlink(filePath).catch(() => undefined);
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }
      if (bytes > MAX_UPLOAD_BYTES) {
        await fs.unlink(filePath).catch(() => undefined);
        return NextResponse.json({ error: "File exceeds 5 GB limit" }, { status: 413 });
      }
      return NextResponse.json(await probeAndDescribe(id, filePath));
    }

    // ---- multipart fallback (buffered) ----
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds 5 GB limit" }, { status: 413 });
    }
    const id = newMediaId();
    const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveMediaBuffer(id, ext, buffer);
    return NextResponse.json(await probeAndDescribe(id, filePath));
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}

async function probeAndDescribe(id: string, filePath: string) {
  let duration = 0;
  let width = 0;
  let height = 0;
  try {
    const probe = await probeMedia(filePath);
    duration = probe.duration;
    width = probe.width;
    height = probe.height;
  } catch {
    // Audio-only or unprobeable input still gets stored; the client falls
    // back to the <video> element's own metadata.
  }
  return { mediaId: id, duration, width, height };
}
