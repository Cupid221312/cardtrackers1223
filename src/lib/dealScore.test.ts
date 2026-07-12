import { describe, it, expect } from "vitest";
import { computeMarketStats, scoreListing, SalePoint } from "./dealScore";

const DAY = 86_400_000;
const asOf = new Date("2026-07-12T00:00:00Z");

/** Build `n` sales, one per `everyDays`, each `price` (optionally jittered). */
function series(n: number, price: number, everyDays = 3, jitter = 0): SalePoint[] {
  const out: SalePoint[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = jitter ? 1 + ((i % 2 ? 1 : -1) * jitter) : 1;
    out.push({ price: price * wobble, soldAt: new Date(asOf.getTime() - i * everyDays * DAY) });
  }
  return out;
}

describe("computeMarketStats", () => {
  it("returns null when there are too few comps", () => {
    expect(computeMarketStats(series(2, 100), asOf)).toBeNull();
  });

  it("returns null when comps are all outside the 120-day lookback", () => {
    const old = series(10, 100).map((s) => ({ ...s, soldAt: new Date(s.soldAt.getTime() - 200 * DAY) }));
    expect(computeMarketStats(old, asOf)).toBeNull();
  });

  it("estimates a stable market value near the comp price", () => {
    const stats = computeMarketStats(series(15, 100, 3, 0.03), asOf)!;
    expect(stats).not.toBeNull();
    expect(stats.marketValue).toBeGreaterThan(90);
    expect(stats.marketValue).toBeLessThan(110);
  });

  it("detects an upward trend as positive", () => {
    // Prices rising over time -> recent sales higher.
    const rising: SalePoint[] = [];
    for (let i = 0; i < 20; i++) {
      const daysAgo = i * 3;
      rising.push({ price: 100 * Math.pow(1.05, (60 - daysAgo) / 30), soldAt: new Date(asOf.getTime() - daysAgo * DAY) });
    }
    const stats = computeMarketStats(rising, asOf)!;
    expect(stats.trend30d).toBeGreaterThan(0.02);
  });

  it("gives higher confidence to many tight recent comps than few noisy old ones", () => {
    const strong = computeMarketStats(series(20, 100, 1, 0.02), asOf)!;
    const weak = computeMarketStats(series(4, 100, 20, 0.4), asOf)!;
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });
});

describe("scoreListing", () => {
  const comps = series(20, 100, 2, 0.03); // liquid, tight market ~ $100

  it("scores a listing priced at market near 50", () => {
    const d = scoreListing(100, comps, asOf)!;
    expect(d.score).toBeGreaterThanOrEqual(40);
    expect(d.score).toBeLessThanOrEqual(60);
    expect(d.label).toBe("fair");
  });

  it("scores a deep discount as a strong buy", () => {
    const d = scoreListing(75, comps, asOf)!;
    expect(d.score).toBeGreaterThanOrEqual(80);
    expect(d.label).toBe("strong buy");
    expect(d.discount).toBeGreaterThan(0.2);
  });

  it("scores an overpriced listing low", () => {
    const d = scoreListing(140, comps, asOf)!;
    expect(d.score).toBeLessThan(40);
    expect(d.label).toBe("overpriced");
    expect(d.discount).toBeLessThan(0);
  });

  it("keeps scores within 0..100", () => {
    expect(scoreListing(1, comps, asOf)!.score).toBeLessThanOrEqual(100);
    expect(scoreListing(100000, comps, asOf)!.score).toBeGreaterThanOrEqual(0);
  });

  it("shrinks a big discount toward neutral when comps are thin/noisy", () => {
    const thin = series(4, 100, 25, 0.4);
    const strong = series(20, 100, 2, 0.03);
    const shaky = scoreListing(75, thin, asOf)!;
    const solid = scoreListing(75, strong, asOf)!;
    expect(solid.score).toBeGreaterThan(shaky.score);
  });

  it("returns null for a non-positive ask or insufficient comps", () => {
    expect(scoreListing(0, comps, asOf)).toBeNull();
    expect(scoreListing(100, series(2, 100), asOf)).toBeNull();
  });
});
