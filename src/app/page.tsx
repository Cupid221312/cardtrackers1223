import { getCards, getDeals, getOverview } from "@/lib/queries";
import { StatTile } from "@/components/StatTile";
import { Sparkline } from "@/components/Sparkline";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DealFeed } from "@/components/DealFeed";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

export default async function Dashboard() {
  const [overview, deals, cards] = await Promise.all([getOverview(), getDeals({ limit: 50 }), getCards()]);
  const sports = [...new Set(cards.map((c) => c.sport))].sort();

  if (overview.trackedCards === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">Card Market Intel</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          No cards are being tracked yet. Seed the database to explore with sample data:
        </p>
        <pre className="mt-4 rounded-lg border px-4 py-3 text-left text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          npm run db:seed
        </pre>
        <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          Or set MOCK_MODE=false and run <code>npm run dev:all</code> to pull live eBay data.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Card Market Intel</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Deal Scores from recency-weighted comps · updated live from the database
          </p>
          <AutoRefresh lastSaleAt={overview.lastSaleAt} />
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

      <DealFeed initialDeals={deals} sports={sports} />

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
