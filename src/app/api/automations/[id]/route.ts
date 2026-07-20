import { NextResponse } from "next/server";
import { deleteRule } from "@/lib/server/automations";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ok = await deleteRule(params.id);
  return NextResponse.json({ ok });
}
