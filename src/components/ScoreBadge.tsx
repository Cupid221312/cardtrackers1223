import type { Deal } from "@/lib/schemas";

const COLOR: Record<Deal["label"], string> = {
  "strong buy": "var(--status-good)",
  "good deal": "var(--status-good)",
  fair: "var(--status-warning)",
  overpriced: "var(--status-serious)",
};

export function ScoreBadge({ score, label }: { score: number; label: Deal["label"] }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white tabular-nums"
        style={{ background: COLOR[label] }}
      >
        {score}
      </span>
      <span className="text-xs font-medium" style={{ color: COLOR[label] }}>
        {label}
      </span>
    </span>
  );
}
