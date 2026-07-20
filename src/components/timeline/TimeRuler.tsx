"use client";

import { formatTime } from "@/lib/time";

/** Tick spacing that keeps labels readable at any zoom level. */
function tickStep(pxPerSec: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) {
    if (s * pxPerSec >= 60) return s;
  }
  return 600;
}

export default function TimeRuler({
  duration,
  pxPerSec,
  labelWidth,
  onScrubStart,
}: {
  duration: number;
  pxPerSec: number;
  labelWidth: number;
  onScrubStart: (e: React.PointerEvent) => void;
}) {
  const step = tickStep(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  return (
    <div
      className="relative h-6 shrink-0 cursor-col-resize select-none border-b border-ink-700 bg-ink-850"
      onPointerDown={onScrubStart}
    >
      <div
        className="sticky left-0 z-10 inline-block h-full border-r border-ink-700 bg-ink-850"
        style={{ width: labelWidth }}
      />
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full border-l border-ink-600"
          style={{ left: labelWidth + t * pxPerSec }}
        >
          <span className="ml-1 text-[9px] tabular-nums text-slate-500">
            {formatTime(t)}
          </span>
        </div>
      ))}
    </div>
  );
}
