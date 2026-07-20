import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
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
 * Downloads a YouTube video into the media store. Primary path is
 * @distube/ytdl-core (pure JS, no system deps); when YouTube changes break
 * it, we fall back to a system `yt-dlp` binary if one is installed
 * (`pip install yt-dlp`), which tracks YouTube much faster.
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

  await ensureMediaDirs();
  const id = newMediaId();
  const filePath = path.join(UPLOAD_DIR, `${id}.mp4`);

  let title = "";
  let ytdlError: unknown = null;
  try {
    title = await downloadWithYtdlCore(body.url, filePath);
  } catch (err) {
    ytdlError = err;
    console.error("[ingest/youtube] ytdl-core failed:", err);
    try {
      title = await downloadWithYtDlp(body.url, filePath);
    } catch (fallbackErr) {
      console.error("[ingest/youtube] yt-dlp fallback failed:", fallbackErr);
      await fs.unlink(filePath).catch(() => undefined);
      return NextResponse.json({ error: ingestErrorMessage(ytdlError, fallbackErr) }, {
        status: 502,
      });
    }
  }

  try {
    const probe = await probeMedia(filePath);
    return NextResponse.json({
      mediaId: id,
      title: title || "YouTube import",
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
    });
  } catch (err) {
    console.error("[ingest/youtube] probe failed:", err);
    await fs.unlink(filePath).catch(() => undefined);
    return NextResponse.json(
      { error: "Downloaded file could not be read as video" },
      { status: 502 },
    );
  }
}

async function downloadWithYtdlCore(
  url: string,
  filePath: string,
): Promise<string> {
  const info = await ytdl.getInfo(url);
  const format = ytdl.chooseFormat(info.formats, {
    quality: "highest",
    filter: (f) => f.hasVideo && f.hasAudio && f.container === "mp4",
  });
  if (!format) throw new Error("no muxed mp4 format available");

  await new Promise<void>((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format });
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => {
      fs.writeFile(filePath, Buffer.concat(chunks)).then(resolve, reject);
    });
  });
  return info.videoDetails.title;
}

/** Fallback via a system yt-dlp binary; resolves the video title. */
async function downloadWithYtDlp(url: string, filePath: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      "-f", "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b",
      "--merge-output-format", "mp4",
      "--write-info-json",
      "-o", filePath,
      url,
    ]);
    let errTail = "";
    proc.stderr.on("data", (d: Buffer) => {
      errTail = (errTail + d.toString()).slice(-1500);
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error("yt-dlp is not installed")
          : err,
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with ${code}: ${errTail.slice(-400)}`));
    });
  });

  // yt-dlp writes <output>.info.json next to the file; read the title, then
  // clean the sidecar up.
  const infoPath = filePath.replace(/\.mp4$/, ".info.json");
  try {
    const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as {
      title?: string;
    };
    return info.title ?? "";
  } catch {
    return "";
  } finally {
    await fs.unlink(infoPath).catch(() => undefined);
  }
}

function ingestErrorMessage(ytdlErr: unknown, fallbackErr: unknown): string {
  const text = `${ytdlErr instanceof Error ? ytdlErr.message : ""} ${
    fallbackErr instanceof Error ? fallbackErr.message : ""
  }`;
  if (/age|private|unavailable|sign in|login/i.test(text)) {
    return "This video is private, age-restricted, or unavailable for download.";
  }
  if (/yt-dlp is not installed/.test(text)) {
    return "YouTube import failed (the built-in downloader may need an update). Installing yt-dlp on the server (`pip install yt-dlp`) enables a more resilient fallback — or upload the file directly.";
  }
  return "YouTube import failed — the network may have blocked the request. Try uploading the file directly.";
}
