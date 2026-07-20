import { NextResponse } from "next/server";
import { deleteProject, loadProject } from "@/lib/server/projects";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const project = await loadProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const removed = await deleteProject(params.id);
  return NextResponse.json({ ok: removed });
}
