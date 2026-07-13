import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // Sale + Listing have FK to Card. Wipe children first so the card can go.
    await prisma.$transaction([
      prisma.sale.deleteMany({ where: { cardId: params.id } }),
      prisma.listing.deleteMany({ where: { cardId: params.id } }),
      prisma.card.delete({ where: { id: params.id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
