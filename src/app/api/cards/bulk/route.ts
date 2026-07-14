/**
 * Bulk-add tracked cards. Accepts either:
 *  - JSON: { text: "…paste or file contents…" }
 *  - raw text/plain body (curl -d @cards.csv)
 * Returns per-row outcomes so the UI can highlight which lines failed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { parseBulk } from "@/lib/bulk-parser";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ctype = req.headers.get("content-type") ?? "";
  let text = "";
  try {
    if (ctype.includes("application/json")) {
      const body = await req.json();
      text = typeof body?.text === "string" ? body.text : "";
    } else {
      text = await req.text();
    }
  } catch {
    return NextResponse.json({ error: "Body must be JSON { text } or plain text." }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "Empty input." }, { status: 400 });

  const parsed = parseBulk(text);
  let added = 0;
  let duplicates = 0;
  const failed: { input: string; reason: string }[] = [...parsed.errors.map((e) => ({ input: e.input, reason: e.reason }))];

  for (const c of parsed.cards) {
    try {
      await prisma.card.create({ data: c });
      added++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unique constraint")) duplicates++;
      else failed.push({ input: `${c.year} ${c.setName} ${c.playerName} #${c.cardNumber}`, reason: msg.slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    parsed: parsed.cards.length,
    added,
    duplicates,
    failed,
  });
}
