# Card Market Intel

Sports & TCG card market intelligence: track cards, ingest sales comps, and rank
active listings with a 0–100 **Deal Score**. Runs fully offline in **mock mode**
(seeded, deterministic data) — no API keys, no Docker, no scrapers needed.

## Quick start

```bash
npm install
cp .env.example .env
npm run db:push    # create the SQLite database (prisma/dev.db)
npm run db:seed    # seed 12 cards, ~2,700 sales comps, ~40 active listings
npm run dev:all    # app + 10-minute market updates · open http://localhost:3000
```

## Live updates (every 10 minutes)

`npm run dev:all` runs the web app and the market scheduler together. The
scheduler (`scripts/scheduler.ts`) runs a refresh cycle immediately and then
every 10 minutes; the dashboard re-fetches itself every 60 seconds, so new
data appears without reloading. In mock mode each cycle simulates the market
moving — new sales at each card's own liquidity, bargain listings getting
bought, fresh listings appearing. Prices, trends, and Deal Scores are always
recomputed from the latest data on every page load.

- `npm run refresh` — run a single update cycle by hand
- `npm run scheduler` — just the 10-minute updater (if you run `npm run dev` separately)
- With `MOCK_MODE=false`, `src/lib/refresh.ts` is the slot where live
  connectors (eBay via Playwright, PriceCharting, Apify) will write real
  sales/listings into the same tables.

## Deal Score engine (`src/lib/dealScore.ts`)

For each active listing, the engine looks at sales comps for the same card +
grade over the last 120 days and computes:

- **Market value** — recency-weighted median (30-day half-life), robust to outliers
- **Trend** — %/30d from a log-price regression
- **Volatility** — MAD/median of comp prices
- **Confidence** — grows with sample size and recent liquidity, shrinks with noise

The score starts at 50 (priced at market), rises with the discount to market
value (+20% discount ≈ +50 points), gets a small trend nudge, and is shrunk
toward 50 when confidence is low — so thin, noisy comps can't produce a
runaway score. Labels: 80+ strong buy · 65+ good deal · 40+ fair · else overpriced.

### Backtesting

```bash
npm run backtest
```

Replays history with no lookahead: each past sale is scored as if it were a
listing (using only earlier sales), and the outcome is the median comp price
over the following 30 days. Current seed results:

| Score bucket | Avg 30d return | Hit rate |
|---|---|---|
| 0–39 (overpriced) | −6.5% | 15% |
| 40–64 (fair) | +3.2% | 66% |
| 65–79 (good deal) | +12.2% | 96% |
| 80–100 (strong buy) | +19.6% | 100% |

Spearman rank correlation (score vs realized return): **0.82**.

## API (typed with zod — schemas in `src/lib/schemas.ts`)

| Route | Description |
|---|---|
| `GET /api/stats` | Dashboard overview (counts, best deal, mock-mode flag) |
| `GET /api/deals?minScore=&sport=&limit=` | Scored active listings, best first (query validated) |
| `GET /api/cards` | Tracked cards with per-grade market stats + sparkline data |

## Stack & layout

Next.js 14 (App Router, TypeScript, Tailwind) · Prisma 6 + SQLite · zod.

```
prisma/schema.prisma    Card / Sale / Listing models
prisma/seed.ts          deterministic mock-market generator
src/lib/dealScore.ts    scoring engine
src/lib/queries.ts      shared data layer (API routes + server components)
src/app/page.tsx        dashboard (stat tiles, deal feed, tracked cards)
scripts/backtest.ts     no-lookahead backtest harness
```

## Going live later

- `MOCK_MODE` in `.env` is surfaced in the UI; live scrapers (Playwright MCP,
  PriceCharting, Apify) would write into the same `Sale`/`Listing` tables and
  everything downstream — engine, API, dashboard — works unchanged.
- To move to Postgres: change the datasource provider in `prisma/schema.prisma`
  to `postgresql`, point `DATABASE_URL` at your instance, re-run
  `npm run db:push && npm run db:seed`.
