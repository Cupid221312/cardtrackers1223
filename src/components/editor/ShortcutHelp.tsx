"use client";

import { useEffect, useState } from "react";

const SHORTCUTS: Array<[string, string]> = [
  ["Space", "Play / pause"],
  ["← / →", "Seek 1s (Shift: 5s)"],
  ["I / O", "Trim clip in / out to playhead"],
  ["S", "Split clip at playhead"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["?", "Toggle this cheat sheet"],
];

/** Keyboard cheat-sheet, toggled with `?`. */
export default function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)
        return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div className="panel w-[340px] p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-sm font-bold text-white">Keyboard shortcuts</h2>
        <div className="flex flex-col gap-1.5">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{action}</span>
              <kbd className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
