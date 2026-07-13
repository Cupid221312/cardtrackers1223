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
## Data sources

Each marketplace is a **Connector** (`src/lib/connectors/types.ts`) — every
source runs through the same hardened HTTP layer (timeout + response size
cap) and gets the same per-cycle error isolation, so a slow or blocked
source can't take down the worker.

| Source | Sold comps | Active listings | Env flag |
|---|---|---|---|
| eBay (public search) | ✅ | ✅ | on by default |
| MySlabs | — | ✅ | `MYSLABS_ENABLED=false` to disable |

Adding another source is a single module implementing the `Connector`
interface plus one line in `src/lib/connectors/index.ts`.

## Real eBay data (no API key needed)

Set `MOCK_MODE=false` in `.env` and restart `npm run dev:all`. Each 10-minute
cycle then pulls **real sold comps and active Buy-It-Now listings** from
eBay's public search for a rotating batch of 4 cards (every card refreshes
roughly hourly), writing into the same tables — scores, trends, and the
dashboard update automatically. Details:

- Comps are filtered so the title must contain the player's last name and the
  exact grade (PSA 10 won't match PSA 9), and duplicate sales are skipped via
  the eBay item id.
- Requests are throttled (`EBAY_REQUEST_DELAY_MS`, default 2000ms) to stay
  polite. Don't lower it aggressively or eBay may rate-limit you.
- Note: this must run on a normal network (your PC). Cloud sandboxes often
  block eBay.
- If eBay redesigns its markup and a fetch parses zero items, the raw HTML is
  saved to `.debug/` — run `npm run check:parser` and update the selectors in
  `src/lib/connectors/ebay.ts`.
- Mock and live data coexist fine: live rows are tagged `source: "ebay"`.
  For a clean slate before going live, delete `prisma/dev.db`, then
  `npm run db:push` (skip the seed) — the dashboard fills up as real data
  arrives.

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

## Tests

```bash
npm test            # 23 unit tests: Deal Score engine + eBay parser
npm run check:parser  # standalone parser fixture check
```

The engine tests cover market-value estimation, trend detection, confidence,
label thresholds, score clamping, and the low-confidence shrink. The parser
tests cover both eBay layouts, price/date parsing, and card/grade matching.

## Dashboard

- **Deal feed** — filter by score (All / Fair+ / Good 65+ / Strong 80+) and by
  sport; narrowed views fetch `/api/deals` live. Click any row for a plain-
  language breakdown of *why* it got that score (discount, trend, confidence)
  and a link to the listing.
- **Auto-refresh** every 60s; **empty state** with seed instructions when the
  database has no cards yet.

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
