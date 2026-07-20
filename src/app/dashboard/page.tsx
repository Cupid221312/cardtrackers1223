import Link from "next/link";
import { listProjects } from "@/lib/server/projects";
import { formatTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Overview dashboard: aggregate stats across saved projects plus a recent
 * projects grid. Server component — reads the project store directly.
 */
export default async function DashboardPage() {
  const projects = await listProjects(50);
  const totalClips = projects.reduce((n, p) => n + p.clipCount, 0);
  const totalDuration = projects.reduce((n, p) => n + p.duration, 0);
  const stats = [
    { label: "Projects", value: String(projects.length) },
    { label: "Clips detected", value: String(totalClips) },
    { label: "Footage processed", value: formatTime(totalDuration) },
    {
      label: "Avg clips / project",
      value: projects.length
        ? (totalClips / projects.length).toFixed(1)
        : "0",
    },
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-ink-700 bg-ink-900 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-glow">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm6 3.6v5.8a.6.6 0 0 0 .92.5l4.55-2.9a.6.6 0 0 0 0-1l-4.55-2.9a.6.6 0 0 0-.92.5Z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-white">
            ClipForge <span className="font-medium text-accent-glow">Dashboard</span>
          </span>
        </div>
        <nav className="flex items-center gap-1 text-xs">
          <Link href="/" className="rounded-md px-2 py-1 font-medium text-slate-400 hover:bg-ink-700 hover:text-white">
            Studio
          </Link>
          <Link href="/automations" className="rounded-md px-2 py-1 font-medium text-slate-400 hover:bg-ink-700 hover:text-white">
            Automations
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {/* stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="panel p-4">
              <p className="text-2xl font-black tabular-nums text-white">{s.value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-500">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* recent projects */}
        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Recent projects</h2>
          <Link href="/" className="btn-primary !py-1.5 text-xs">
            + New clip session
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="panel mt-3 p-8 text-center">
            <p className="text-sm text-slate-400">No projects yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Import a video in the Studio and your sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link
                key={p.mediaId}
                href="/"
                className="panel flex flex-col gap-2 p-4 transition hover:border-ink-500"
              >
                <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-ink-700 to-ink-800">
                  <img
                    src={`/api/media/${p.mediaId}/thumbs`}
                    alt=""
                    className="h-full w-full rounded-lg object-cover opacity-80"
                  />
                </div>
                <p className="truncate text-sm font-semibold text-slate-100">
                  {p.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatTime(p.duration)} · {p.clipCount} clip
                  {p.clipCount === 1 ? "" : "s"} ·{" "}
                  {new Date(p.savedAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
