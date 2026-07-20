"use client";

import { useMemo } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import TrackShell from "@/components/timeline/TrackShell";

/**
 * Audio track with a deterministic pseudo-waveform (seeded by bar index) —
 * a real decoded waveform is on the roadmap; the lane, scale, and scrub
 * behavior are already final.
 */
export default function AudioTrack({
  labelWidth,
  onScrubStart,
}: {
  labelWidth: number;
  onScrubStart: (e: React.PointerEvent) => void;
}) {
  const source = useEditorStore((s) => s.source);
  const pxPerSec = useEditorStore((s) => s.pxPerSec);
  const volume = useEditorStore((s) => s.audio.volume);
  const musicName = useEditorStore((s) => s.audio.musicName);

  const duration = source?.duration ?? 0;
  const width = duration * pxPerSec;
  const barW = 3;
  const barCount = Math.max(0, Math.floor(width / barW));

  const bars = useMemo(() => {
    // Cheap deterministic "waveform": layered sines with index-hash jitter.
    return Array.from({ length: barCount }, (_, i) => {
      const h = Math.abs(Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.077) * 0.4);
      const jitter = ((i * 2654435761) % 97) / 97;
      return 0.15 + 0.85 * (h * 0.7 + jitter * 0.3);
    });
  }, [barCount]);

  return (
    <TrackShell
      label="Audio"
      color="#2dd4a0"
      labelWidth={labelWidth}
      onScrubStart={onScrubStart}
      height={40}
    >
      {source && (
        <div
          className="pointer-events-none absolute inset-y-1.5 flex items-center gap-0 overflow-hidden rounded-md bg-brand-green/10"
          style={{ left: 0, width }}
        >
          {bars.map((h, i) => (
            <div
              key={i}
              className="shrink-0 rounded-full bg-brand-green/70"
              style={{
                width: 1.5,
                marginLeft: barW - 1.5,
                height: `${h * Math.min(1, volume) * 88}%`,
              }}
            />
          ))}
        </div>
      )}
      {musicName && source && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-1.5 rounded-full bg-accent/60"
          style={{ width }}
          title={`Music: ${musicName}`}
        />
      )}
    </TrackShell>
  );
}
