"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import type { SavedProject } from "@/lib/types";

const DEBOUNCE_MS = 2000;

/** Serialize the current session into a SavedProject payload. */
export function buildProjectPayload(): SavedProject | null {
  const s = useEditorStore.getState();
  if (!s.source) return null;
  return {
    mediaId: s.source.mediaId,
    name: s.source.name,
    duration: s.source.duration,
    width: s.source.width,
    height: s.source.height,
    origin: s.source.origin,
    savedAt: Date.now(),
    state: {
      transcript: s.transcript,
      clips: s.clips,
      selectedClipId: s.selectedClipId,
      captionStyle: s.captionStyle,
      hookBanner: s.hookBanner,
      framing: s.framing,
      filters: s.filters,
      audio: {
        volume: s.audio.volume,
        noiseReduction: s.audio.noiseReduction,
        volumeLeveling: s.audio.volumeLeveling,
        musicMediaId: s.audio.musicMediaId,
        musicName: s.audio.musicName,
        musicVolume: s.audio.musicVolume,
        ducking: s.audio.ducking,
      },
      silenceCut: s.silenceCut,
      stickers: s.stickers.map((st) => ({
        id: st.id,
        name: st.name,
        dataUrl: st.dataUrl,
        x: st.x,
        y: st.y,
        scale: st.scale,
        opacity: st.opacity,
      })),
      keyframesByClip: s.keyframesByClip,
    },
  };
}

/**
 * Debounced server-side autosave of the editing session. Watches the
 * creative fields by reference (all updates are immutable) and PUTs a
 * project snapshot ~2s after the last change.
 */
export function useProjectAutosave(): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (!state.source) return;
      const changed =
        state.transcript !== prev.transcript ||
        state.clips !== prev.clips ||
        state.selectedClipId !== prev.selectedClipId ||
        state.captionStyle !== prev.captionStyle ||
        state.hookBanner !== prev.hookBanner ||
        state.framing !== prev.framing ||
        state.filters !== prev.filters ||
        state.audio !== prev.audio ||
        state.silenceCut !== prev.silenceCut ||
        state.stickers !== prev.stickers ||
        state.keyframesByClip !== prev.keyframesByClip ||
        state.source !== prev.source;
      if (!changed) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const payload = buildProjectPayload();
        if (!payload) return;
        void fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => undefined); // autosave is best-effort by design
      }, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
