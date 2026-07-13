import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCards } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await getCards();
  return NextResponse.json({ cards });
}

const newCardSchema = z.object({
  playerName: z.string().min(1).max(120),
  year: z.coerce.number().int().min(1900).max(2100),
  setName: z.string().min(1).max(120),
  cardNumber: z.string().min(1).max(40),
  variant: z.string().max(40).default("Base"),
  sport: z.enum(["Basketball", "Football", "Baseball", "Hockey", "Soccer", "TCG", "Other"]),
  searchQuery: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = newCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const card = await prisma.card.create({ data: parsed.data });
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    // Prisma unique-constraint code for our @@unique on (player, year, set, #, variant)
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That card is already being tracked." }, { status: 409 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

