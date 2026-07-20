import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import ytdl from "@distube/ytdl-core";
import {
  UPLOAD_DIR,
  ensureMediaDirs,
  newMediaId,
  probeMedia,
} from "@/lib/server/media";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({ url: z.string().url() });

/**
 * Downloads a YouTube video (best mp4 with audio+video muxed) into the
 * media store. YouTube frequently changes its player; failures surface as
 * a clear actionable error instead of a hang.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "A valid URL is required" }, { status: 400 });
  }

  if (!ytdl.validateURL(body.url)) {
    return NextResponse.json(
      { error: "That doesn't look like a YouTube video URL" },
      { status: 400 },
    );
  }

  try {
    const info = await ytdl.getInfo(body.url);
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: (f) => f.hasVideo && f.hasAudio && f.container === "mp4",
    });
    if (!format) {
      return NextResponse.json(
        { error: "No downloadable mp4 format found for this video" },
        { status: 422 },
      );
    }

    await ensureMediaDirs();
    const id = newMediaId();
    const filePath = path.join(UPLOAD_DIR, `${id}.mp4`);

    await new Promise<void>((resolve, reject) => {
      const stream = ytdl.downloadFromInfo(info, { format });
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("error", reject);
      stream.on("end", () => {
        fs.writeFile(filePath, Buffer.concat(chunks)).then(resolve, reject);
      });
    });

    const probe = await probeMedia(filePath);
    return NextResponse.json({
      mediaId: id,
      title: info.videoDetails.title,
      duration: probe.duration || Number(info.videoDetails.lengthSeconds),
      width: probe.width,
      height: probe.height,
    });
  } catch (err) {
    console.error("[ingest/youtube]", err);
    const message =
      err instanceof Error && /age|private|unavailable|sign in/i.test(err.message)
        ? "This video is private, age-restricted, or unavailable for download."
        : "YouTube import failed — the downloader may need an update, or the network blocked the request. Try uploading the file directly.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
