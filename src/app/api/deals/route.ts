import { NextRequest, NextResponse } from "next/server";
import { dealsQuerySchema } from "@/lib/schemas";
import { getDeals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const parsed = dealsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const deals = await getDeals(parsed.data);
  return NextResponse.json({ deals });
}
