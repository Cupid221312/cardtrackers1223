/**
 * One-shot setup endpoint. Consumed by a browser tap on first deploy so the
 * user never has to open a terminal. Guarded by REFRESH_SECRET (accepted as
 * either a query param `?secret=…` or an Authorization header) so it can't
 * be triggered by anyone who stumbles onto the URL.
 *
 * Safe to hit again — the seed wipes and reloads the sample cards. If the
 * schema already exists (post first deploy) it's just a re-seed.
 */
import { NextRequest, NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";
import { ensureSchema } from "@/lib/schema-init";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authed(req: NextRequest): boolean {
  const expected = process.env.REFRESH_SECRET;
  if (!expected) return false;
  const q = req.nextUrl.searchParams.get("secret");
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = q ?? h ?? "";
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handle(req: NextRequest) {
  if (!process.env.REFRESH_SECRET) {
    return NextResponse.json({ error: "REFRESH_SECRET not configured" }, { status: 500 });
  }
  if (!authed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const seed = req.nextUrl.searchParams.get("seed") !== "false";
  try {
    await ensureSchema();
    const counts = seed ? await seedDatabase() : { cards: 0, sales: 0, listings: 0 };
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      schemaReady: true,
      seeded: seed ? counts : "skipped (pass ?seed=false to skip)",
      message: seed
        ? "Database ready with sample cards. Visit the dashboard, or /manage to swap in your own."
        : "Database schema ready. Head to /manage to add cards.",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
