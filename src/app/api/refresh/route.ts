/**
 * Serverless-friendly refresh trigger. Consumed by GitHub Actions cron every
 * 10 minutes on the fully-free deployment path (Vercel + Neon), where a
 * long-lived scheduler process isn't available.
 *
 * Protected by a shared bearer token (REFRESH_SECRET) so only your workflow
 * can trigger it — never leave this endpoint open, since it triggers real
 * outbound requests to eBay/MySlabs and DB writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { runRefresh } from "@/lib/refresh";

export const dynamic = "force-dynamic";
// Vercel Hobby tier caps functions at 10s; a live cycle with 4 cards × 2
// grades × 2 sources × ~2s politeness delay = ~30-60s. If you hit the cap,
// either upgrade to Pro (maxDuration below can be up to 300s) or reduce
// CARDS_PER_CYCLE in src/lib/refresh.ts.
export const maxDuration = 60;

function ok(token: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  const clean = token?.trim().replace(/^Bearer\s+/i, "") ?? "";
  // Constant-time compare — avoids leaking secret length via timing.
  if (clean.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < clean.length; i++) diff |= clean.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function handle(req: NextRequest) {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "REFRESH_SECRET not configured on this deployment" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization");
  if (!ok(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const summary = await runRefresh();
    return NextResponse.json({ ok: true, ms: Date.now() - started, summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export const POST = handle;
// GET is convenient for a quick browser-tab health check (still requires the
// bearer token — no data leaks). GitHub Actions uses POST.
export const GET = handle;
