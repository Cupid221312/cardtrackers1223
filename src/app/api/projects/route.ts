import { NextRequest, NextResponse } from "next/server";
import type { SavedProject } from "@/lib/types";
import { findMediaPath } from "@/lib/server/media";
import { listProjects, saveProject } from "@/lib/server/projects";

export const runtime = "nodejs";

const MAX_PROJECT_BYTES = 20 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

/** Autosave endpoint — the client debounces, we validate and write. */
export async function POST(req: NextRequest) {
  let project: SavedProject;
  try {
    const raw = await req.text();
    if (raw.length > MAX_PROJECT_BYTES) {
      return NextResponse.json({ error: "Project too large" }, { status: 413 });
    }
    project = JSON.parse(raw) as SavedProject;
    if (!project?.mediaId || !project?.state) throw new Error("bad shape");
  } catch {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }

  // Only persist sessions whose media still exists — a restore without the
  // media would be a dead entry.
  if (!(await findMediaPath(project.mediaId))) {
    return NextResponse.json({ error: "Unknown media id" }, { status: 404 });
  }

  try {
    await saveProject({ ...project, savedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[projects] save failed:", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
