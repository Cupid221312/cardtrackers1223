export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {detail && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </div>
      )}
    </div>
  );
}
