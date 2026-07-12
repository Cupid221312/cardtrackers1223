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

const TICK_MINUTES = 10;

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export async function runRefresh(): Promise<string> {
  if (process.env.MOCK_MODE === "false") {
    return "MOCK_MODE=false but no live data connectors are configured yet — nothing to ingest.";
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
