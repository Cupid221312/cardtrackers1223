import { NextResponse } from "next/server";
import { getOverview } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const overview = await getOverview();
  return NextResponse.json(overview);
}
