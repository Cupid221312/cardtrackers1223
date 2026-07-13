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
  try {
    const counts = await seedDatabase();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      seeded: counts,
      message: "Database ready. Visit the dashboard.",
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
