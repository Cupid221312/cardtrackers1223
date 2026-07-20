import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listConnections,
  removeConnection,
  setConnection,
} from "@/lib/server/automations";

export const runtime = "nodejs";

const ConnectSchema = z.object({
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  account: z.string().min(1).max(120),
  token: z.string().min(1).max(4000),
});

export async function GET() {
  return NextResponse.json({ connections: await listConnections() });
}

/** Store a platform access token the user obtained via that platform's
 *  developer console. Never returns the token back to the client. */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof ConnectSchema>;
  try {
    body = ConnectSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "platform, account, token required" }, { status: 400 });
  }
  const conn = await setConnection(body.platform, body.account, body.token);
  return NextResponse.json({ connection: conn });
}

export async function DELETE(req: NextRequest) {
  const platform = new URL(req.url).searchParams.get("platform");
  if (platform !== "youtube" && platform !== "tiktok" && platform !== "instagram") {
    return NextResponse.json({ error: "unknown platform" }, { status: 400 });
  }
  await removeConnection(platform);
  return NextResponse.json({ ok: true });
}
