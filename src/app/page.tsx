import { getCards, getDeals, getOverview } from "@/lib/queries";
import { StatTile } from "@/components/StatTile";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Sparkline } from "@/components/Sparkline";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

export default async function Dashboard() {
  const [overview, deals, cards] = await Promise.all([getOverview(), getDeals({ limit: 25 }), getCards()]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Card Market Intel</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Deal Scores from recency-weighted comps · updated live from the database
          </p>
        </div>
        {overview.mockMode && (
          <span
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            MOCK MODE — seeded data, no live scraping
          </span>
        )}
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Tracked cards" value={String(overview.trackedCards)} />
        <StatTile label="Active listings" value={String(overview.activeListings)} detail={`${overview.salesTracked} comps on file`} />
        <StatTile label="Strong buys (80+)" value={String(overview.strongBuys)} />
        <StatTile
          label="Best deal right now"
          value={overview.bestDeal ? String(overview.bestDeal.score) : "—"}
          detail={overview.bestDeal ? `${overview.bestDeal.title} · ${usd(overview.bestDeal.askPrice)}` : undefined}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Deal feed</h2>
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
              {deals.map((d) => (
                <tr key={d.listingId} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3">
                    <ScoreBadge score={d.score} label={d.label} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {d.sport} · {d.source}
                    </div>
                  </td>
                  <td className="px-4 py-3">{d.grade}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{usd(d.askPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{usd(d.stats.marketValue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(d.discount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(d.stats.trend30d)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.stats.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tracked cards</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                <th className="px-4 py-3">Card</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3 text-right">Market value</th>
                <th className="px-4 py-3 text-right">30d trend</th>
                <th className="px-4 py-3 text-right">Sales /30d</th>
                <th className="px-4 py-3">Price history</th>
              </tr>
            </thead>
            <tbody>
              {cards.flatMap((c) =>
                c.grades.map((g, i) => (
                  <tr key={`${c.id}-${g.grade}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      {i === 0 ? (
                        <>
                          <div className="font-medium">
                            {c.year} {c.setName} {c.playerName} #{c.cardNumber}
                            {c.variant !== "Base" ? ` ${c.variant}` : ""}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {c.sport}
                          </div>
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{g.grade}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.stats ? usd(g.stats.marketValue) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.stats ? pct(g.stats.trend30d) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{g.stats ? g.stats.salesLast30d : "—"}</td>
                    <td className="px-4 py-3">
                      <Sparkline points={g.spark} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
