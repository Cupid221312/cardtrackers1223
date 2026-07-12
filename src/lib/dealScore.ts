/**
 * Deal Score engine.
 *
 * Given the sales history for a (card, grade) and an asking price, produces a
 * 0–100 score. 50 means "priced at market"; higher means a better deal. The
 * score is discount-driven, nudged by trend, and shrunk toward 50 when the
 * comp data is thin or noisy (low confidence), so a big discount on two
 * scattered comps never outranks a solid discount on twenty tight ones.
 */

export interface SalePoint {
  price: number;
  soldAt: Date;
}

export interface MarketStats {
  /** Recency-weighted robust market value. */
  marketValue: number;
  /** Price trend as fraction per 30 days (0.05 = +5%/month). */
  trend30d: number;
  /** Median absolute deviation / median — relative price noise. */
  volatility: number;
  /** Sales in the last 30 days before `asOf`. */
  salesLast30d: number;
  sampleSize: number;
  /** 0–1: how much to trust marketValue. */
  confidence: number;
}

export interface ScoredDeal {
  score: number;
  discount: number; // fraction below market (negative = above market)
  label: "strong buy" | "good deal" | "fair" | "overpriced";
  stats: MarketStats;
}

const HALF_LIFE_DAYS = 30;
const LOOKBACK_DAYS = 120;
const MIN_COMPS = 3;

const DAY = 86_400_000;

function weightedMedian(values: number[], weights: number[]): number {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= total / 2) return values[i];
  }
  return values[idx[idx.length - 1]];
}

export function computeMarketStats(sales: SalePoint[], asOf: Date = new Date()): MarketStats | null {
  const cutoff = asOf.getTime() - LOOKBACK_DAYS * DAY;
  const comps = sales
    .filter((s) => s.soldAt.getTime() <= asOf.getTime() && s.soldAt.getTime() >= cutoff)
    .sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime());
  if (comps.length < MIN_COMPS) return null;

  const ages = comps.map((s) => (asOf.getTime() - s.soldAt.getTime()) / DAY);
  const weights = ages.map((a) => Math.pow(0.5, a / HALF_LIFE_DAYS));
  const prices = comps.map((s) => s.price);

  const marketValue = weightedMedian(prices, weights);

  // Trend: least-squares slope of log(price) vs age, converted to %/30d.
  const xs = ages.map((a) => -a); // older = more negative
  const ys = prices.map((p) => Math.log(p));
  const n = comps.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slopePerDay = den > 0 ? num / den : 0;
  const trend30d = Math.exp(slopePerDay * 30) - 1;

  const median = weightedMedian(prices, prices.map(() => 1));
  const absDev = prices.map((p) => Math.abs(p - median));
  const mad = weightedMedian(absDev, absDev.map(() => 1));
  const volatility = median > 0 ? mad / median : 0;

  const salesLast30d = comps.filter((s) => asOf.getTime() - s.soldAt.getTime() <= 30 * DAY).length;

  // Confidence grows with sample size and recent liquidity, shrinks with noise.
  const sizeFactor = Math.min(1, n / 12);
  const liquidityFactor = Math.min(1, salesLast30d / 4);
  const noiseFactor = 1 / (1 + 4 * volatility);
  const confidence = Math.max(0.05, sizeFactor * 0.4 + liquidityFactor * 0.3 + noiseFactor * 0.3);

  return { marketValue, trend30d, volatility, salesLast30d, sampleSize: n, confidence };
}

export function scoreListing(askPrice: number, sales: SalePoint[], asOf: Date = new Date()): ScoredDeal | null {
  const stats = computeMarketStats(sales, asOf);
  if (!stats || askPrice <= 0) return null;

  const discount = (stats.marketValue - askPrice) / stats.marketValue;

  // 20% below market maps to +50 points over neutral; clamp the raw signal.
  let raw = 50 + discount * 250;
  // Rising markets make a given discount slightly better, falling ones worse.
  raw += Math.max(-10, Math.min(10, stats.trend30d * 100));

  // Shrink toward neutral when confidence is low.
  const score = Math.round(Math.max(0, Math.min(100, 50 + (raw - 50) * stats.confidence)));

  const label = score >= 80 ? "strong buy" : score >= 65 ? "good deal" : score >= 40 ? "fair" : "overpriced";
  return { score, discount, label, stats };
}

/**
 * Plain-language reasons behind a score, for display in the UI so the number
 * is never a black box. Mirrors the factors used in `scoreListing`.
 */
export function explainScore(deal: ScoredDeal): string[] {
  const { discount, stats } = deal;
  const reasons: string[] = [];
  const pct = (n: number) => `${Math.abs(n * 100).toFixed(1)}%`;

  reasons.push(
    discount > 0.01
      ? `Priced ${pct(discount)} below market value`
      : discount < -0.01
        ? `Priced ${pct(discount)} above market value`
        : `Priced right at market value`
  );
  if (Math.abs(stats.trend30d) >= 0.02) {
    reasons.push(`Market is ${stats.trend30d > 0 ? "rising" : "falling"} (${pct(stats.trend30d)}/30d)`);
  }
  reasons.push(
    stats.confidence >= 0.75
      ? `High confidence: ${stats.sampleSize} comps, ${stats.salesLast30d} in last 30d`
      : stats.confidence >= 0.4
        ? `Moderate confidence: ${stats.sampleSize} comps`
        : `Low confidence — thin/noisy comps, score pulled toward neutral`
  );
  return reasons;
}
