/**
 * Shared bearer-token auth for admin endpoints. Accepts the shared
 * REFRESH_SECRET via either an `Authorization: Bearer <token>` header or a
 * `?secret=<token>` query param, so the same secret works from cURL, the
 * GitHub Actions workflow, and the browser-based manage page.
 */
import { NextRequest } from "next/server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.REFRESH_SECRET;
  if (!expected) return false;
  const q = req.nextUrl.searchParams.get("secret");
  const h = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = q ?? h ?? "";
  return timingSafeEqual(provided, expected);
}
