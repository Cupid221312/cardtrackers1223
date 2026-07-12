"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/schemas";
import { explainScore } from "@/lib/dealScore";
import { ScoreBadge } from "./ScoreBadge";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

const SCORE_FILTERS = [
  { label: "All", min: 0 },
  { label: "Fair+", min: 40 },
  { label: "Good 65+", min: 65 },
  { label: "Strong 80+", min: 80 },
];

export function DealFeed({ initialDeals, sports }: { initialDeals: Deal[]; sports: string[] }) {
  const [sport, setSport] = useState<string>("");
  const [minScore, setMinScore] = useState<number>(0);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only hit the API when a filter is actually narrowed; the initial (unfiltered)
  // view is already server-rendered.
  useEffect(() => {
    if (sport === "" && minScore === 0) {
      setDeals(initialDeals);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (minScore) params.set("minScore", String(minScore));
    if (sport) params.set("sport", sport);
    fetch(`/api/deals?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDeals(d.deals ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sport, minScore, initialDeals]);

  const controlStyle = { borderColor: "var(--border)", background: "var(--surface-2)" };

  const pillActive = (active: boolean) =>
    active
      ? { background: "var(--series-1)", color: "#fff", borderColor: "var(--series-1)" }
      : { ...controlStyle, color: "var(--text-secondary)" };

  const summary = useMemo(() => {
    if (deals.length === 0) return "";
    const strong = deals.filter((d) => d.score >= 80).length;
    return `${deals.length} listing${deals.length === 1 ? "" : "s"}${strong ? ` · ${strong} strong buy${strong === 1 ? "" : "s"}` : ""}`;
  }, [deals]);

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Deal feed</h2>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {loading ? "loading…" : summary}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {SCORE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setMinScore(f.min)}
              className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
              style={pillActive(minScore === f.min)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="rounded-full border px-3 py-1 text-xs font-medium"
          style={controlStyle}
          aria-label="Filter by sport"
        >
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Card</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3 text-right">Ask</th>
              <th className="px-4 py-3 text-right">Market</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">30d trend</th>
              <th className="px-4 py-3 text-right">Comps</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                  No listings match these filters.
                </td>
              </tr>
            )}
            {deals.map((d) => {
              const open = expanded === d.listingId;
              return (
                <Fragment key={d.listingId}>
                  <tr
                    onClick={() => setExpanded(open ? null : d.listingId)}
                    className="cursor-pointer border-t transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-3">
                      <ScoreBadge score={d.score} label={d.label} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {d.sport} · {d.source} · {open ? "hide" : "why?"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{d.grade}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{usd(d.askPrice)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{usd(d.stats.marketValue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pct(d.discount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pct(d.stats.trend30d)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.stats.sampleSize}</td>
                  </tr>
                  {open && (
                    <tr style={{ borderColor: "var(--border)" }}>
                      <td colSpan={8} className="px-4 pb-4" style={{ background: "var(--surface-1)" }}>
                        <ul className="ml-2 mt-1 list-disc pl-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {explainScore(d).map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                          {d.url && (
                            <li>
                              <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--series-1)" }}>
                                View listing on {d.source} ↗
                              </a>
                            </li>
                          )}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
