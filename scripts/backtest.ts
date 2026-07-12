/**
 * Deal Score backtest.
 *
 * Replays history: every sale (after a warm-up window) is treated as if it had
 * been an active listing at that price on that date. The engine scores it
 * using ONLY sales that happened before it (no lookahead), and the "realized
 * outcome" is the median sale price over the following 30 days versus the
 * hypothetical purchase price.
 *
 * A healthy engine shows realized return increasing monotonically across
 * score buckets, with the 80+ bucket clearly positive.
 *
 * Run: npm run backtest
 */
import { PrismaClient } from "@prisma/client";
import { scoreListing, SalePoint } from "../src/lib/dealScore";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const WARMUP_SALES = 8;
const OUTCOME_WINDOW_DAYS = 30;

interface Trial {
  score: number;
  realizedReturn: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const cards = await prisma.card.findMany({ include: { sales: { orderBy: { soldAt: "asc" } } } });
  const trials: Trial[] = [];

  for (const card of cards) {
    const byGrade = new Map<string, SalePoint[]>();
    for (const s of card.sales) {
      const arr = byGrade.get(s.grade) ?? [];
      arr.push({ price: s.price, soldAt: s.soldAt });
      byGrade.set(s.grade, arr);
    }

    for (const sales of Array.from(byGrade.values())) {
      for (let i = WARMUP_SALES; i < sales.length; i++) {
        const candidate = sales[i];
        const prior = sales.slice(0, i);
        const scored = scoreListing(candidate.price, prior, candidate.soldAt);
        if (!scored) continue;

        const windowEnd = candidate.soldAt.getTime() + OUTCOME_WINDOW_DAYS * DAY;
        const future = sales
          .slice(i + 1)
          .filter((s) => s.soldAt.getTime() <= windowEnd)
          .map((s) => s.price);
        if (future.length < 2) continue;

        trials.push({ score: scored.score, realizedReturn: median(future) / candidate.price - 1 });
      }
    }
  }

  if (trials.length === 0) {
    console.log("No trials — seed the database first (npm run db:seed).");
    return;
  }

  const buckets: [string, (t: Trial) => boolean][] = [
    ["  0–39 (overpriced)", (t) => t.score < 40],
    [" 40–64 (fair)      ", (t) => t.score >= 40 && t.score < 65],
    [" 65–79 (good deal) ", (t) => t.score >= 65 && t.score < 80],
    ["80–100 (strong buy)", (t) => t.score >= 80],
  ];

  console.log(`\nBacktest: ${trials.length} simulated purchases, ${OUTCOME_WINDOW_DAYS}d outcome window\n`);
  console.log("score bucket          trials   avg return   hit rate (return > 0)");
  console.log("-".repeat(66));
  for (const [name, pred] of buckets) {
    const b = trials.filter(pred);
    if (b.length === 0) {
      console.log(`${name}       0            -            -`);
      continue;
    }
    const avg = b.reduce((s, t) => s + t.realizedReturn, 0) / b.length;
    const hit = b.filter((t) => t.realizedReturn > 0).length / b.length;
    console.log(
      `${name}   ${String(b.length).padStart(5)}   ${(avg * 100).toFixed(1).padStart(9)}%   ${(hit * 100).toFixed(0).padStart(8)}%`
    );
  }

  // Rank correlation between score and realized return (Spearman).
  const rank = (xs: number[]) => {
    const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const r = new Array(xs.length);
    idx.forEach((orig, pos) => (r[orig] = pos));
    return r as number[];
  };
  const rs = rank(trials.map((t) => t.score));
  const rr = rank(trials.map((t) => t.realizedReturn));
  const n = trials.length;
  const mrs = rs.reduce((s, v) => s + v, 0) / n;
  const mrr = rr.reduce((s, v) => s + v, 0) / n;
  let num = 0, ds = 0, dr = 0;
  for (let i = 0; i < n; i++) {
    num += (rs[i] - mrs) * (rr[i] - mrr);
    ds += (rs[i] - mrs) ** 2;
    dr += (rr[i] - mrr) ** 2;
  }
  const rho = num / Math.sqrt(ds * dr);
  console.log(`\nSpearman rank correlation (score vs realized return): ${rho.toFixed(3)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
