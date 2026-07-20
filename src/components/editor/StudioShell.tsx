"use client";

import { useEffect } from "react";
import SourcePanel from "@/components/editor/SourcePanel";
import PreviewCanvas from "@/components/editor/PreviewCanvas";
import InspectorPanel from "@/components/editor/InspectorPanel";
import Timeline from "@/components/timeline/Timeline";
import ExportQueueModal from "@/components/editor/ExportQueueModal";
import { useEditorStore } from "@/lib/store/editorStore";

export default function StudioShell() {
  // Persisted styling settings are rehydrated after mount (skipHydration
  // in the store) so SSR markup and the first client render agree.
  useEffect(() => {
    void useEditorStore.persist.rehydrate();
  }, []);

  const setExportModalOpen = useEditorStore((s) => s.setExportModalOpen);
  const hasSource = useEditorStore((s) => s.source !== null);
  const jobs = useEditorStore((s) => s.exportJobs);
  const activeJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing",
  ).length;

  return (
    <div className="flex h-full flex-col bg-ink-950">
      {/* ---- top bar ------------------------------------------------------ */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-ink-700 bg-ink-900 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-glow">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13Zm6 3.6v5.8a.6.6 0 0 0 .92.5l4.55-2.9a.6.6 0 0 0 0-1l-4.55-2.9a.6.6 0 0 0-.92.5Z" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            ClipForge <span className="font-medium text-accent-glow">Studio</span>
          </span>
        </div>
        <button
          className="btn-primary relative flex items-center gap-2 !py-1.5"
          onClick={() => setExportModalOpen(true)}
          disabled={!hasSource}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
            <path d="M12 3a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4l3.3 3.3V4a1 1 0 0 1 1-1Zm-7 15a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z" />
          </svg>
          Export
          {activeJobs > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-yellow px-1 text-[10px] font-bold text-black">
              {activeJobs}
            </span>
          )}
        </button>
      </header>

      {/* ---- main workspace ---------------------------------------------- */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-ink-700 bg-ink-900 p-3">
          <SourcePanel />
        </aside>

        <main className="flex min-w-0 flex-1 items-center justify-center bg-ink-950 p-4">
          <PreviewCanvas />
        </main>

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-ink-700 bg-ink-900 p-3">
          <InspectorPanel />
        </aside>
      </div>

      {/* ---- timeline ----------------------------------------------------- */}
      <footer className="h-[220px] shrink-0 border-t border-ink-700 bg-ink-900">
        <Timeline />
      </footer>

      <ExportQueueModal />
    </div>
  );
}
