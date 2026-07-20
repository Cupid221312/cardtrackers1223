"use client";

/** Shared row chrome: sticky label + content lane at the timeline scale. */
export default function TrackShell({
  label,
  color,
  labelWidth,
  children,
  onScrubStart,
  height = 44,
}: {
  label: string;
  color: string;
  labelWidth: number;
  children: React.ReactNode;
  onScrubStart?: (e: React.PointerEvent) => void;
  height?: number;
}) {
  return (
    <div
      className="relative flex shrink-0 border-b border-ink-700/60"
      style={{ height }}
    >
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-ink-700 bg-ink-900 px-2"
        style={{ width: labelWidth }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </span>
      </div>
      <div
        className="relative flex-1"
        onPointerDown={(e) => {
          // Only scrub when clicking empty lane space, not blocks/handles.
          if (e.target === e.currentTarget) onScrubStart?.(e);
        }}
      >
        {children}
      </div>
    </div>
  );
}
