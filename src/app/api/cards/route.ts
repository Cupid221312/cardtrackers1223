import { NextResponse } from "next/server";
import { getCards } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await getCards();
  return NextResponse.json({ cards });
}
