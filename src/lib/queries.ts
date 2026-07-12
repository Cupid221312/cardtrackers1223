import { prisma } from "./db";
import { computeMarketStats, scoreListing } from "./dealScore";
import type { CardSummary, Deal, Overview } from "./schemas";

const cardTitle = (c: { year: number; setName: string; playerName: string; cardNumber: string; variant: string }) =>
  `${c.year} ${c.setName} ${c.playerName} #${c.cardNumber}${c.variant !== "Base" ? ` ${c.variant}` : ""}`;

export async function getDeals(opts: { minScore?: number; sport?: string; limit: number }): Promise<Deal[]> {
  const listings = await prisma.listing.findMany({
    where: { active: true, ...(opts.sport ? { card: { sport: opts.sport } } : {}) },
    include: { card: { include: { sales: true } } },
  });

  const deals: Deal[] = [];
  for (const l of listings) {
    const sales = l.card.sales
      .filter((s) => s.grade === l.grade)
      .map((s) => ({ price: s.price, soldAt: s.soldAt }));
    const scored = scoreListing(l.askPrice, sales);
    if (!scored) continue;
    if (opts.minScore !== undefined && scored.score < opts.minScore) continue;
    deals.push({
      listingId: l.id,
      cardId: l.cardId,
      title: cardTitle(l.card),
      grade: l.grade,
      sport: l.card.sport,
      askPrice: l.askPrice,
      listedAt: l.listedAt.toISOString(),
      source: l.source,
      score: scored.score,
      discount: scored.discount,
      label: scored.label,
      stats: scored.stats,
    });
  }
  deals.sort((a, b) => b.score - a.score);
  return deals.slice(0, opts.limit);
}

export async function getCards(): Promise<CardSummary[]> {
  const cards = await prisma.card.findMany({
    include: { sales: { orderBy: { soldAt: "asc" } } },
    orderBy: { playerName: "asc" },
  });

  return cards.map((c) => {
    const grades = [...new Set(c.sales.map((s) => s.grade))].sort();
    return {
      id: c.id,
      playerName: c.playerName,
      year: c.year,
      setName: c.setName,
      cardNumber: c.cardNumber,
      variant: c.variant,
      sport: c.sport,
      grades: grades.map((grade) => {
        const sales = c.sales.filter((s) => s.grade === grade);
        const points = sales.map((s) => ({ price: s.price, soldAt: s.soldAt }));
        return {
          grade,
          stats: computeMarketStats(points),
          spark: sales.slice(-40).map((s) => ({ t: s.soldAt.getTime(), price: s.price })),
        };
      }),
    };
  });
}

export async function getOverview(): Promise<Overview> {
  const [trackedCards, activeListings, salesTracked, deals] = await Promise.all([
    prisma.card.count(),
    prisma.listing.count({ where: { active: true } }),
    prisma.sale.count(),
    getDeals({ limit: 200 }),
  ]);
  return {
    trackedCards,
    activeListings,
    salesTracked,
    strongBuys: deals.filter((d) => d.score >= 80).length,
    bestDeal: deals[0] ?? null,
    mockMode: process.env.MOCK_MODE !== "false",
  };
}
