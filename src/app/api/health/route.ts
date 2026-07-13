/**
 * Liveness + readiness probe. Consumed by Docker HEALTHCHECK and by
 * Render/Railway/Vercel to decide whether the container is fit to serve.
 *
 *   200 { status: "ok",   db, connectors, lastSaleAt, uptime }  → route traffic
 *   503 { status: "degraded", ... }                              → drain / restart
 *
 * The DB check is a cheap `SELECT 1` so it can be hit every few seconds
 * without load. Circuit-breaker state is informational — a source being
 * "open" isn't degraded (that's the breaker doing its job); only a failed
 * DB ping flips the overall status.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enabledConnectors } from "@/lib/connectors";
import { getBreakerHealth } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const started = Date.now();
  let db: { ok: boolean; latencyMs?: number; error?: string };
  try {
    const t = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    db = { ok: true, latencyMs: Date.now() - t };
  } catch (e) {
    db = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  let lastSaleAt: string | null = null;
  if (db.ok) {
    try {
      const row = await prisma.sale.findFirst({ orderBy: { soldAt: "desc" }, select: { soldAt: true } });
      lastSaleAt = row?.soldAt.toISOString() ?? null;
    } catch {
      /* non-critical */
    }
  }

  const registered = enabledConnectors().map((c) => c.source);
  const breakers = getBreakerHealth();
  // A source is "unknown" until the worker touches it — that's fine for the
  // web container which never runs cycles.
  const connectors = registered.map((source) => ({
    source,
    state: breakers.find((b) => b.source === source)?.state ?? "unknown",
  }));

  const body = {
    status: db.ok ? "ok" : "degraded",
    checkedInMs: Date.now() - started,
    uptimeSec: Math.round(process.uptime()),
    mockMode: process.env.MOCK_MODE !== "false",
    db,
    lastSaleAt,
    connectors,
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503 });
}
