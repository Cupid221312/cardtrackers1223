"use client";

import { useEffect, useMemo, useState } from "react";
import { useEditorStore, useSelectedClip } from "@/lib/store/editorStore";
import TrackShell from "@/components/timeline/TrackShell";
import { computeKeepSegments, removedRanges } from "@/services/ai/silence";

/**
 * Audio track rendering the source's real amplitude envelope (decoded
 * server-side via /api/media/[id]/waveform) as one mirrored SVG path.
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
  const silenceCut = useEditorStore((s) => s.silenceCut);
  const words = useEditorStore((s) => s.transcript?.words ?? null);
  const clip = useSelectedClip();
  const [peaks, setPeaks] = useState<number[] | null>(null);

  // Visualize what the jump cuts will remove from the selected clip.
  const cuts = useMemo(() => {
    if (!silenceCut.enabled || !clip || !words) return [];
    const keep = computeKeepSegments(
      words,
      clip.start,
      clip.end,
      silenceCut.minGap,
    );
    return removedRanges(keep, clip.start, clip.end);
  }, [silenceCut.enabled, silenceCut.minGap, clip, words]);

  const mediaId = source?.mediaId ?? "";
  useEffect(() => {
    if (!mediaId) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    setPeaks(null);
    fetch(`/api/media/${mediaId}/waveform`)
      .then((res) => (res.ok ? res.json() : { peaks: [] }))
      .then((body) => {
        if (!cancelled) setPeaks(Array.isArray(body.peaks) ? body.peaks : []);
      })
      .catch(() => {
        if (!cancelled) setPeaks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const duration = source?.duration ?? 0;
  const width = duration * pxPerSec;
  const gain = Math.min(1, volume);

  // One mirrored bar per peak in a 0..N x 0..100 viewBox, stretched to the
  // lane width — a single DOM node regardless of zoom level.
  const pathD = useMemo(() => {
    if (!peaks || peaks.length === 0) return "";
    const parts: string[] = [];
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(1.5, peaks[i] * gain * 46);
      parts.push(`M${i + 0.5} ${50 - h}V${50 + h}`);
    }
    return parts.join("");
  }, [peaks, gain]);

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
          className="pointer-events-none absolute inset-y-1.5 overflow-hidden rounded-md bg-brand-green/10"
          style={{ left: 0, width }}
        >
          {peaks === null ? (
            <div className="flex h-full items-center px-2 text-[9px] uppercase tracking-wider text-brand-green/50">
              Decoding waveform…
            </div>
          ) : pathD ? (
            <svg
              className="h-full w-full"
              viewBox={`0 0 ${peaks.length} 100`}
              preserveAspectRatio="none"
            >
              <path
                d={pathD}
                stroke="#2dd4a0"
                strokeOpacity={0.75}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <div className="absolute inset-x-0 top-1/2 h-px bg-brand-green/40" />
          )}
        </div>
      )}
      {source &&
        cuts.map((cut, i) => (
          <div
            key={i}
            className="pointer-events-none absolute inset-y-0.5 z-10 rounded-sm bg-brand-red/25"
            style={{
              left: cut.start * pxPerSec,
              width: Math.max(2, (cut.end - cut.start) * pxPerSec),
            }}
            title={`Silence cut: ${(cut.end - cut.start).toFixed(2)}s removed`}
          >
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-brand-red/60" />
          </div>
        ))}
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
