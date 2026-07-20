import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import ytdl from "@distube/ytdl-core";
import {
  UPLOAD_DIR,
  ensureMediaDirs,
  newMediaId,
  probeMedia,
} from "@/lib/server/media";

/**
 * URL ingest for YouTube, Twitch VODs/clips, and Kick VODs/clips.
 *
 * YouTube uses @distube/ytdl-core first (pure JS, no system deps) and
 * falls back to yt-dlp. Twitch and Kick have no JS downloader, so they go
 * straight to yt-dlp — which must be installed on the server
 * (`pip install yt-dlp`); the Docker image bundles it.
 */

export type IngestPlatform = "youtube" | "twitch" | "kick";

export interface IngestResult {
  mediaId: string;
  title: string;
  duration: number;
  width: number;
  height: number;
  platform: IngestPlatform;
}

/**
 * Resolve the platform for a URL, or null if unsupported. Only an
 * explicit allowlist of public video hosts over http(s) is accepted:
 * handing arbitrary URLs to yt-dlp is an SSRF / local-file-read risk
 * (file:// extractor, cloud metadata at 169.254.169.254, internal
 * services), so unknown hosts are rejected rather than attempted.
 */
export function detectPlatform(rawUrl: string): IngestPlatform | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) {
    return "youtube";
  }
  if (host === "twitch.tv" || host.endsWith(".twitch.tv")) return "twitch";
  if (host === "kick.com" || host.endsWith(".kick.com")) return "kick";
  return null;
}

const PLATFORM_LABEL: Record<IngestPlatform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  kick: "Kick",
};

export async function ingestFromUrl(url: string): Promise<IngestResult> {
  const platform = detectPlatform(url);
  if (!platform) {
    throw new IngestError(
      "Only YouTube, Twitch, and Kick links are supported. Paste a link from one of those, or upload the file directly.",
      400,
    );
  }

  await ensureMediaDirs();
  const id = newMediaId();
  const filePath = path.join(UPLOAD_DIR, `${id}.mp4`);

  let title = "";
  try {
    if (platform === "youtube") {
      title = await downloadYouTube(url, filePath);
    } else {
      title = await downloadWithYtDlp(url, filePath);
    }
  } catch (err) {
    await fs.unlink(filePath).catch(() => undefined);
    throw toIngestError(err, platform);
  }

  try {
    const probe = await probeMedia(filePath);
    return {
      mediaId: id,
      title: title || `${PLATFORM_LABEL[platform]} import`,
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      platform,
    };
  } catch (err) {
    await fs.unlink(filePath).catch(() => undefined);
    console.error("[ingest] probe failed:", err);
    throw new IngestError("Downloaded file could not be read as video", 502);
  }
}

async function downloadYouTube(url: string, filePath: string): Promise<string> {
  if (!ytdl.validateURL(url)) {
    // A youtube.com URL that isn't a watchable video (channel, playlist…).
    return downloadWithYtDlp(url, filePath);
  }
  try {
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
  } catch (err) {
    console.error("[ingest] ytdl-core failed, trying yt-dlp:", err);
    return downloadWithYtDlp(url, filePath);
  }
}

/** Download via a system yt-dlp binary; resolves the media title. */
function downloadWithYtDlp(url: string, filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      // Prefer a muxed mp4 <=1080p; fall back to best video+audio merged.
      "-f", "b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b",
      "--merge-output-format", "mp4",
      "--print", "after_move:title",
      "-o", filePath,
      url,
    ]);
    let out = "";
    let errTail = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => {
      errTail = (errTail + d.toString()).slice(-2000);
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new Error("yt-dlp is not installed") : err);
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(out.trim().split("\n").pop() ?? "");
      else reject(new Error(`yt-dlp exited with ${code}: ${errTail.slice(-500)}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IngestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function toIngestError(err: unknown, platform: IngestPlatform): IngestError {
  const text = err instanceof Error ? err.message : String(err);
  if (/yt-dlp is not installed/.test(text)) {
    return new IngestError(
      `${PLATFORM_LABEL[platform]} links need yt-dlp installed on the server (\`pip install yt-dlp\`). The Docker image includes it — or upload the file directly.`,
      501,
    );
  }
  // Network/egress problems first, so a blocked host isn't mislabeled as
  // a private video.
  if (/proxy|tunnel|forbidden|econnrefused|etimedout|timed out|connect to|network|getaddrinfo|403|407/i.test(text)) {
    return new IngestError(
      "Couldn't reach that host — the network or a proxy blocked the request. This works on a server with open outbound access; otherwise upload the file directly.",
      502,
    );
  }
  if (/is not a valid URL|Unsupported URL|no video|not available on this app/i.test(text)) {
    return new IngestError(
      "That link isn't a downloadable video (it may be a live stream, channel, or unsupported page).",
      422,
    );
  }
  if (/age|private|unavailable|sign in|login|members-only|subscriber/i.test(text)) {
    return new IngestError(
      "That video is private, subscriber-only, age-restricted, or unavailable for download.",
      422,
    );
  }
  console.error(`[ingest] ${platform} failed:`, text);
  return new IngestError(
    `Couldn't import that ${PLATFORM_LABEL[platform]} link — it may be a live stream or the network blocked the request. Try uploading the file directly.`,
    502,
  );
}
