import { prisma } from "@mail-orbyt/database";
import { revokeToken } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const REVOKE_MAX_ATTEMPTS = 30;
const REVOKE_WINDOW_SECONDS = 60 * 60;

const bodySchema = z.object({ token: z.string().min(1) });

/** RFC 7009 token revocation — accepts either an access or a refresh token; always reports success per spec, even for an already-invalid token, so this can't be used to probe token validity. */
export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `oauth-revoke:${clientIpFrom(request)}`,
    REVOKE_MAX_ATTEMPTS,
    REVOKE_WINDOW_SECONDS,
  );
  if (!allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  const contentType = request.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> | null;
  if (contentType.includes("application/json")) {
    raw = await request.json().catch(() => null);
  } else {
    const form = await request.formData().catch(() => null);
    raw = form ? Object.fromEntries(form.entries()) : null;
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  await revokeToken(prisma, parsed.data.token);

  return new NextResponse(null, { status: 200 });
}
