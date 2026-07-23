"use client";

import { useState } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import clsx from "clsx";

/**
 * Word-level transcript with click-to-seek and inline correction.
 * Double-click a word to edit it; the caption track updates instantly
 * because captions are derived from these same word objects.
 */
export default function TranscriptPanel() {
  const transcript = useEditorStore((s) => s.transcript);
  const currentTime = useEditorStore((s) => s.currentTime);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!transcript) {
    return (
      <section className="panel p-3">
        <h2 className="panel-title mb-2">Transcript</h2>
        <p className="text-xs leading-relaxed text-slate-500">
          Import media and the Whisper transcript will appear here with
          word-level timestamps. Double-click any word to correct it.
        </p>
      </section>
    );
  }

  const commit = (wordId: string) => {
    const text = draft.trim();
    if (text) useEditorStore.getState().updateWordText(wordId, text);
    setEditingId(null);
  };

  return (
    <section className="panel flex min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="panel-title">Transcript</h2>
        <span
          className={clsx(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            transcript.source === "whisper"
              ? "bg-brand-green/15 text-brand-green"
              : "bg-brand-yellow/15 text-brand-yellow",
          )}
          title={
            transcript.source === "whisper"
              ? "Transcribed with OpenAI Whisper"
              : "OPENAI_API_KEY not set — placeholder transcript for layout/demo"
          }
        >
          {transcript.source === "whisper" ? "Whisper" : "Demo"}
        </span>
      </div>
      {transcript.source !== "whisper" && (
        <p className="mb-2 rounded-md border border-brand-yellow/30 bg-brand-yellow/10 p-2 text-[11px] leading-relaxed text-brand-yellow">
          This is a <b>placeholder</b> transcript, not your video&apos;s speech.
          To get the real transcript free: create a free key at{" "}
          <b>console.groq.com</b> (no card), add <b>GROQ_API_KEY=...</b> to a{" "}
          <b>.env</b> file in the project folder, restart, and re-import.
        </p>
      )}
      <div className="max-h-64 overflow-y-auto pr-1 text-[13px] leading-[1.9]">
        {transcript.words.map((word) =>
          editingId === word.id ? (
            <input
              key={word.id}
              autoFocus
              className="mx-0.5 inline-block w-24 rounded border border-accent bg-ink-900 px-1 text-[13px] text-white outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(word.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(word.id);
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <span
              key={word.id}
              role="button"
              tabIndex={0}
              className={clsx(
                "cursor-pointer rounded px-[3px] py-[1px] transition-colors",
                currentTime >= word.start && currentTime < word.end
                  ? "bg-accent/30 text-white"
                  : "text-slate-300 hover:bg-ink-700",
              )}
              onClick={() => useEditorStore.getState().seekTo(word.start)}
              onDoubleClick={() => {
                setEditingId(word.id);
                setDraft(word.text);
              }}
              title={`${word.start.toFixed(2)}s — double-click to edit`}
            >
              {word.text}{" "}
            </span>
          ),
        )}
      </div>
    </section>
  );
}
