interface Point {
  t: number;
  price: number;
}

export function Sparkline({ points, width = 120, height = 32 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="text-xs" style={{ color: "var(--text-secondary)" }}>—</span>;

  const ts = points.map((p) => p.t);
  const ps = points.map((p) => p.price);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const pMin = Math.min(...ps);
  const pMax = Math.max(...ps);
  const pad = 3;
  const x = (t: number) => pad + ((t - tMin) / (tMax - tMin || 1)) * (width - 2 * pad);
  const y = (p: number) => height - pad - ((p - pMin) / (pMax - pMin || 1)) * (height - 2 * pad);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Price history, ${points.length} sales, from $${first.price.toFixed(0)} to $${last.price.toFixed(0)}`}
    >
      <title>{`${points.length} sales · latest $${last.price.toFixed(0)}`}</title>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.price)} r="3" fill="var(--series-1)" stroke="var(--surface-2)" strokeWidth="2" />
    </svg>
  );
}
