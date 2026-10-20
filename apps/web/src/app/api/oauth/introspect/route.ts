import { prisma } from "@mail-orbyt/database";
import {
  authenticateIntrospectionClient,
  introspectAccessToken,
  parseBasicAuth,
} from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

// Resource servers introspect on every request, so this is generous; it
// exists to bound credential-guessing from one address, not to meter use.
const INTROSPECT_MAX_ATTEMPTS = 20000;
const INTROSPECT_WINDOW_SECONDS = 60 * 60;

const bodySchema = z.object({ token: z.string().min(1) });

/**
 * RFC 7662 token introspection. Authenticated as a confidential client via
 * HTTP Basic (McpIntrospectionClient). Accepts JSON or form-encoded
 * `token`; an unknown/expired/revoked token is `{active:false}`, never an error.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `oauth-introspect:${clientIpFrom(request)}`,
    INTROSPECT_MAX_ATTEMPTS,
    INTROSPECT_WINDOW_SECONDS,
  );
  if (!allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (!credentials || !(await authenticateIntrospectionClient(prisma, credentials))) {
    return NextResponse.json(
      { error: "invalid_client" },
      { status: 401, headers: { "www-authenticate": 'Basic realm="introspection"' } },
    );
  }

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

  const result = await introspectAccessToken(prisma, parsed.data.token);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
