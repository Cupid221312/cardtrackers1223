# Deployment guide

Two deploy targets covered here. Both use the same `Dockerfile` — the choice
is about where the container(s) run.

- **Render** — one PR, one dashboard, persistent web + persistent worker. **Recommended** for this app, because the scheduler is a real long-lived process.
- **Vercel + Neon** — serverless web + serverless Postgres. Faster to try, but Vercel functions can't run a persistent 10-minute scheduler, so live scraping needs a separate cron trigger (Vercel Cron or GitHub Actions).

## Local parity test first

```
docker compose up --build
# open http://localhost:3000
# curl http://localhost:3000/api/health
```

This spins up Postgres 16, runs `prisma db push`, boots the web server, and
starts the scheduler as a separate service. It's exactly what production
looks like, minus the domain name.

## Option A — Render (recommended)

1. Push this repo to GitHub (already done — the branch is `claude/card-market-intel-setup-cds2yl`).
2. In [Render](https://render.com), *New → Blueprint* and point it at the repo.
   Use the `render.yaml` in the repo root (below). Render will provision:
   - a Postgres database
   - a Web Service (Dockerfile, runs `node server.js`)
   - a Background Worker (Dockerfile, runs the scheduler)
3. Set `MOCK_MODE=false` on both services once the web service is healthy.
4. First-time schema push: open the web service's shell and run
   `npx prisma db push --schema=prisma/schema.postgres.prisma`.

Render pings `/api/health` before routing traffic and restarts a container
that returns 503 for too long.

## Option B — Vercel + Neon

1. Create a free [Neon](https://neon.tech) Postgres database. Copy the
   connection string. Append `?connection_limit=20&pool_timeout=20`.
2. Import the repo into [Vercel](https://vercel.com). Set env vars:
   `DATABASE_URL`, `MOCK_MODE=true` (start in mock mode).
3. Vercel builds with `next build` — the standalone output isn't needed.
   Deploy.
4. Push the schema: from your machine,
   `DATABASE_URL="…neon…" npx prisma db push --schema=prisma/schema.postgres.prisma`.
5. Vercel functions can't hold a 10-minute interval, so add a **Vercel Cron
   Job** hitting `/api/refresh` every 10 minutes. (You'll add that endpoint
   as a thin wrapper around `runRefresh` in a follow-up; the current
   scheduler script is for persistent workers.)

## Env vars (production)

Set on the platform, never committed. See `.env.example` for the full list.

Minimum required:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres URL with `?connection_limit=20&pool_timeout=20` |
| `MOCK_MODE` | `true` for demo, `false` for live scraping |

Optional tuning:

| Var | Default |
|---|---|
| `REFRESH_INTERVAL_MS` | 600000 (10 min) |
| `EBAY_TIMEOUT_MS` | 15000 |
| `MYSLABS_ENABLED` | true |
