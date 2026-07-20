import { NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import { exportOutputPath, getJob } from "@/lib/ffmpeg/exporter";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const job = getJob(params.id);
  if (!job || job.status !== "done") {
    return NextResponse.json(
      { error: "Export not found or not finished" },
      { status: 404 },
    );
  }
  const filePath = exportOutputPath(params.id);
  try {
    const stat = await fs.stat(filePath);
    const safeTitle =
      job.clipTitle.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") ||
      "clip";
    return new NextResponse(
      createReadStream(filePath) as unknown as ReadableStream,
      {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(stat.size),
          "Content-Disposition": `attachment; filename="${safeTitle}_${job.preset}_1080x1920.mp4"`,
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Output file missing" }, { status: 404 });
  }
}
