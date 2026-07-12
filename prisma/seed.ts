/**
 * Mock-mode seed: 12 tracked cards, ~120 days of simulated sales history per
 * card/grade, and a batch of active listings priced at varied discounts so the
 * Deal Score feed has a realistic spread. Deterministic (seeded PRNG) so
 * re-seeding gives the same data.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Deterministic PRNG (mulberry32)
function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260712);

const DAY = 86_400_000;
const NOW = new Date("2026-07-12T00:00:00Z").getTime();

interface CardSpec {
  playerName: string;
  year: number;
  setName: string;
  cardNumber: string;
  variant: string;
  sport: string;
  basePrice: number; // PSA 10 market value anchor
  monthlyTrend: number; // fraction per 30d
  noise: number; // relative sale-to-sale noise
  salesPerWeek: number;
}

const CARDS: CardSpec[] = [
  { playerName: "Victor Wembanyama", year: 2023, setName: "Prizm", cardNumber: "136", variant: "Base", sport: "Basketball", basePrice: 420, monthlyTrend: 0.06, noise: 0.07, salesPerWeek: 6 },
  { playerName: "Victor Wembanyama", year: 2023, setName: "Prizm", cardNumber: "136", variant: "Silver", sport: "Basketball", basePrice: 1900, monthlyTrend: 0.08, noise: 0.09, salesPerWeek: 3 },
  { playerName: "Luka Doncic", year: 2018, setName: "Prizm", cardNumber: "280", variant: "Base", sport: "Basketball", basePrice: 750, monthlyTrend: 0.02, noise: 0.06, salesPerWeek: 5 },
  { playerName: "Shohei Ohtani", year: 2018, setName: "Topps Chrome", cardNumber: "150", variant: "Base", sport: "Baseball", basePrice: 610, monthlyTrend: 0.04, noise: 0.08, salesPerWeek: 5 },
  { playerName: "Ronald Acuna Jr.", year: 2018, setName: "Topps Chrome", cardNumber: "193", variant: "Base", sport: "Baseball", basePrice: 240, monthlyTrend: -0.02, noise: 0.07, salesPerWeek: 4 },
  { playerName: "C.J. Stroud", year: 2023, setName: "Prizm", cardNumber: "311", variant: "Base", sport: "Football", basePrice: 165, monthlyTrend: -0.04, noise: 0.1, salesPerWeek: 4 },
  { playerName: "Patrick Mahomes", year: 2017, setName: "Prizm", cardNumber: "269", variant: "Base", sport: "Football", basePrice: 1450, monthlyTrend: 0.03, noise: 0.05, salesPerWeek: 4 },
  { playerName: "Connor Bedard", year: 2023, setName: "Upper Deck Young Guns", cardNumber: "451", variant: "Base", sport: "Hockey", basePrice: 480, monthlyTrend: 0.01, noise: 0.09, salesPerWeek: 3 },
  { playerName: "Charizard", year: 1999, setName: "Pokemon Base Set", cardNumber: "4", variant: "Holo Unlimited", sport: "TCG", basePrice: 5200, monthlyTrend: 0.05, noise: 0.06, salesPerWeek: 2 },
  { playerName: "Pikachu", year: 2021, setName: "Celebrations", cardNumber: "5", variant: "Gold", sport: "TCG", basePrice: 95, monthlyTrend: 0.0, noise: 0.12, salesPerWeek: 7 },
  { playerName: "Caitlin Clark", year: 2024, setName: "Prizm WNBA", cardNumber: "22", variant: "Base", sport: "Basketball", basePrice: 310, monthlyTrend: 0.1, noise: 0.11, salesPerWeek: 6 },
  { playerName: "Jude Bellingham", year: 2023, setName: "Topps Chrome UCC", cardNumber: "30", variant: "Base", sport: "Soccer", basePrice: 205, monthlyTrend: 0.03, noise: 0.08, salesPerWeek: 4 },
];

const GRADES: { grade: string; mult: number }[] = [
  { grade: "PSA 10", mult: 1 },
  { grade: "PSA 9", mult: 0.42 },
];

async function main() {
  await prisma.listing.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.card.deleteMany();

  for (const spec of CARDS) {
    const card = await prisma.card.create({
      data: {
        playerName: spec.playerName,
        year: spec.year,
        setName: spec.setName,
        cardNumber: spec.cardNumber,
        variant: spec.variant,
        sport: spec.sport,
      },
    });

    for (const { grade, mult } of GRADES) {
      const anchor = spec.basePrice * mult;
      const dailyGrowth = Math.pow(1 + spec.monthlyTrend, 1 / 30);

      // Sales over the past 180 days.
      const sales: { price: number; soldAt: Date }[] = [];
      for (let day = 180; day >= 0; day--) {
        const expected = spec.salesPerWeek / 7;
        if (rand() < expected) {
          const trendPrice = anchor * Math.pow(dailyGrowth, -day);
          const noisy = trendPrice * (1 + (rand() * 2 - 1) * spec.noise * 2);
          sales.push({
            price: Math.round(noisy * 100) / 100,
            soldAt: new Date(NOW - day * DAY - Math.floor(rand() * DAY)),
          });
        }
      }
      await prisma.sale.createMany({
        data: sales.map((s) => ({ cardId: card.id, grade, price: s.price, soldAt: s.soldAt })),
      });

      // 1–2 active listings per card/grade at varied discounts, including a
      // few genuine steals and a few overpriced asks.
      const listingCount = 1 + (rand() < 0.5 ? 1 : 0);
      for (let i = 0; i < listingCount; i++) {
        const r = rand();
        // Skew: mostly near market, occasionally -25%…+20%
        const discount = r < 0.15 ? 0.15 + rand() * 0.15 : r < 0.3 ? -(0.05 + rand() * 0.15) : (rand() * 2 - 1) * 0.08;
        const ask = anchor * (1 - discount);
        await prisma.listing.create({
          data: {
            cardId: card.id,
            grade,
            askPrice: Math.round(ask * 100) / 100,
            title: `${spec.year} ${spec.setName} ${spec.playerName} #${spec.cardNumber} ${spec.variant} ${grade}`,
            listedAt: new Date(NOW - Math.floor(rand() * 5 * DAY)),
            source: "mock",
            active: true,
          },
        });
      }
    }
  }

  const [cards, salesCount, listings] = await Promise.all([
    prisma.card.count(),
    prisma.sale.count(),
    prisma.listing.count(),
  ]);
  console.log(`Seeded ${cards} cards, ${salesCount} sales, ${listings} active listings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
