/**
 * One market-refresh cycle. Designed to run every 10 minutes.
 *
 * In mock mode it simulates the market moving, calibrated from each card's own
 * history (liquidity, volatility, trend) so the drift looks organic:
 *   - new sales arrive at roughly the card's recent sales rate
 *   - active listings get bought (deactivated + recorded as a sale),
 *     underpriced ones faster than overpriced ones
 *   - fresh listings appear at varied discounts to market
 *
 * With MOCK_MODE=false this is where live connectors (eBay via Playwright,
 * PriceCharting, Apify) will write into the same Sale/Listing tables —
 * everything downstream is unchanged.
 */
import { prisma } from "./db";
import { computeMarketStats } from "./dealScore";
import { enabledConnectors } from "./connectors";
import type { CardQuery, Connector } from "./connectors";
import { CircuitBreaker, CircuitOpenError } from "./worker/circuit-breaker";
import { withRetry } from "./retry";

const TICK_MINUTES = 10;
/** Live mode: cards refreshed per 10-minute cycle (politeness rate limit). */
const CARDS_PER_CYCLE = 4;
const GRADES = ["PSA 10", "PSA 9"];

// Breakers persist across cycles so a run of failures actually opens the
// circuit. Keyed by connector.source.
const breakers = new Map<string, CircuitBreaker>();
function breakerFor(c: Connector): CircuitBreaker {
  let b = breakers.get(c.source);
  if (!b) {
    b = new CircuitBreaker(c.source, { failureThreshold: 4, cooldownMs: 5 * 60_000 });
    breakers.set(c.source, b);
  }
  return b;
}

async function callConnector<T>(
  connector: Connector,
  op: (c: Connector) => Promise<T>
): Promise<T> {
  return breakerFor(connector).exec(() =>
    withRetry(() => op(connector), {
      attempts: 3,
      baseMs: 800,
      onRetry: (err, i, delay) =>
        console.warn(`[refresh] ${connector.source} retry ${i + 1} in ${delay}ms: ${err instanceof Error ? err.message : err}`),
    })
  );
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export async function runRefresh(): Promise<string> {
  if (process.env.MOCK_MODE === "false") {
    return runLiveRefresh();
  }

  const now = new Date();
  const cards = await prisma.card.findMany({
    include: { sales: true, listings: { where: { active: true } } },
  });

  let newSales = 0;
  let listingsSold = 0;
  let newListings = 0;

  for (const card of cards) {
    const grades = Array.from(new Set(card.sales.map((s) => s.grade)));
    for (const grade of grades) {
      const history = card.sales
        .filter((s) => s.grade === grade)
        .map((s) => ({ price: s.price, soldAt: s.soldAt }));
      const stats = computeMarketStats(history, now);
      if (!stats) continue;

      const mv = stats.marketValue;
      const spread = Math.max(0.03, stats.volatility * 2);

      // Organic sales at the card's own recent rate.
      const pSale = (stats.salesLast30d / 30) * (TICK_MINUTES / 1440);
      if (Math.random() < pSale) {
        await prisma.sale.create({
          data: {
            cardId: card.id,
            grade,
            price: Math.round(mv * (1 + gauss() * spread) * 100) / 100,
            soldAt: now,
            source: "mock",
          },
        });
        newSales++;
      }

      // Listings get bought — bargains disappear fastest.
      for (const l of card.listings.filter((l) => l.grade === grade)) {
        const discount = (mv - l.askPrice) / mv;
        const pBuy = discount > 0.1 ? 0.06 : discount > 0 ? 0.02 : 0.005;
        if (Math.random() < pBuy) {
          await prisma.$transaction([
            prisma.listing.update({ where: { id: l.id }, data: { active: false } }),
            prisma.sale.create({
              data: { cardId: card.id, grade, price: l.askPrice, soldAt: now, source: "mock" },
            }),
          ]);
          listingsSold++;
        }
      }

      // Fresh listings appear now and then; ~1 in 6 is a genuine steal.
      if (Math.random() < 0.04) {
        const discount = Math.random() < 0.17 ? 0.12 + Math.random() * 0.18 : gauss() * 0.08;
        await prisma.listing.create({
          data: {
            cardId: card.id,
            grade,
            askPrice: Math.round(mv * (1 - discount) * 100) / 100,
            title: `${card.year} ${card.setName} ${card.playerName} #${card.cardNumber}${card.variant !== "Base" ? ` ${card.variant}` : ""} ${grade}`,
            listedAt: now,
            source: "mock",
            active: true,
          },
        });
        newListings++;
      }
    }
  }

  return `${now.toISOString()} refresh: +${newSales} sales, ${listingsSold} listings sold, +${newListings} new listings`;
}

/**
 * Live ingest from eBay. Rotates through tracked cards (oldest data first),
 * a few per cycle, pulling sold comps and active Buy-It-Now listings into the
 * same tables the mock path uses. Every card gets fresh data roughly hourly
 * with the default 12-card / 4-per-cycle setup.
 */
async function runLiveRefresh(): Promise<string> {
  const now = new Date();
  const cards = await prisma.card.findMany({
    orderBy: [{ lastFetchedAt: { sort: "asc", nulls: "first" } }],
    take: CARDS_PER_CYCLE,
  });

  let newSales = 0;
  let upsertedListings = 0;
  let delisted = 0;
  const problems: string[] = [];

  const connectors = enabledConnectors();

  for (const card of cards) {
    for (const grade of GRADES) {
      const q: CardQuery = {
        playerName: card.playerName,
        year: card.year,
        setName: card.setName,
        cardNumber: card.cardNumber,
        variant: card.variant,
        grade,
        overrideQuery: card.searchQuery ?? undefined,
      };

      for (const conn of connectors) {
        const context = `${conn.source} · ${card.playerName} ${grade}`;
        try {
          // --- sold comps (skip sources that don't expose them; a no-op
          // "success" would reset the breaker and mask real failures) ---
          const sold = conn.supportsSolds ? await callConnector(conn, (c) => c.fetchSolds(q)) : [];
          if (sold.length > 0) {
            const existing = new Set(
              (
                await prisma.sale.findMany({
                  where: { externalId: { in: sold.map((s) => s.externalId) } },
                  select: { externalId: true },
                })
              ).map((s) => s.externalId)
            );
            for (const s of sold) {
              if (existing.has(s.externalId)) continue;
              await prisma.sale.create({
                data: {
                  cardId: card.id,
                  grade,
                  price: s.price,
                  soldAt: s.soldAt,
                  source: conn.source,
                  externalId: s.externalId,
                },
              });
              newSales++;
            }
          }

          // --- active listings ---
          const active = conn.supportsActives ? await callConnector(conn, (c) => c.fetchActives(q)) : [];
          for (const a of active) {
            await prisma.listing.upsert({
              where: { externalId: a.externalId },
              update: { askPrice: a.price, active: true },
              create: {
                cardId: card.id,
                grade,
                askPrice: a.price,
                title: a.title,
                listedAt: now,
                source: conn.source,
                url: a.url,
                externalId: a.externalId,
                active: true,
              },
            });
            upsertedListings++;
          }
          // Listings from THIS source for this card/grade that vanished from
          // search results are gone (sold or ended) — retire them. Scoped by
          // source so one connector's outage doesn't wipe another's listings.
          if (active.length > 0) {
            const gone = await prisma.listing.updateMany({
              where: {
                cardId: card.id,
                grade,
                source: conn.source,
                active: true,
                externalId: { notIn: active.map((a) => a.externalId) },
              },
              data: { active: false },
            });
            delisted += gone.count;
          }
        } catch (e) {
          const msg = e instanceof CircuitOpenError ? "circuit open (skipped)" : e instanceof Error ? e.message : String(e);
          if (problems.length < 20) problems.push(`${context}: ${msg}`);
        }
      }
    }

    await prisma.card.update({ where: { id: card.id }, data: { lastFetchedAt: now } });
  }

  const sources = connectors
    .map((c) => `${c.source}[${breakerFor(c).status}]`)
    .join(" ");
  const summary = `${now.toISOString()} LIVE refresh (${cards.length} cards, ${sources}): +${newSales} sales, ${upsertedListings} listings upserted, ${delisted} delisted`;
  return problems.length ? `${summary}\n  issues: ${problems.join(" | ")}` : summary;
}
