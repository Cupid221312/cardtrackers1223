import { promises as fs } from "fs";
import path from "path";
import type { SavedProject, SavedProjectSummary } from "@/lib/types";
import { isValidMediaId } from "@/lib/server/media";

/** Project session files live next to the media store, one per media id. */
const PROJECT_DIR = path.join(
  process.env.DATA_DIR || path.join(process.cwd(), ".data"),
  "projects",
);

async function ensureProjectDir(): Promise<void> {
  await fs.mkdir(PROJECT_DIR, { recursive: true });
}

function projectPath(mediaId: string): string {
  return path.join(PROJECT_DIR, `${mediaId}.json`);
}

export async function saveProject(project: SavedProject): Promise<void> {
  if (!isValidMediaId(project.mediaId)) throw new Error("Bad media id");
  await ensureProjectDir();
  // Write via temp+rename so a crash mid-write never corrupts a project.
  const target = projectPath(project.mediaId);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project));
  await fs.rename(tmp, target);
}

export async function loadProject(mediaId: string): Promise<SavedProject | null> {
  if (!isValidMediaId(mediaId)) return null;
  try {
    const raw = await fs.readFile(projectPath(mediaId), "utf8");
    return JSON.parse(raw) as SavedProject;
  } catch {
    return null;
  }
}

export async function deleteProject(mediaId: string): Promise<boolean> {
  if (!isValidMediaId(mediaId)) return false;
  try {
    await fs.unlink(projectPath(mediaId));
    return true;
  } catch {
    return false;
  }
}

export async function listProjects(limit = 20): Promise<SavedProjectSummary[]> {
  await ensureProjectDir();
  const entries = await fs.readdir(PROJECT_DIR);
  const summaries: SavedProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(PROJECT_DIR, entry), "utf8");
      const p = JSON.parse(raw) as SavedProject;
      summaries.push({
        mediaId: p.mediaId,
        name: p.name,
        duration: p.duration,
        savedAt: p.savedAt,
        clipCount: p.state.clips.length,
      });
    } catch {
      // Skip unreadable entries rather than failing the whole listing.
    }
  }
  return summaries.sort((a, b) => b.savedAt - a.savedAt).slice(0, limit);
}
