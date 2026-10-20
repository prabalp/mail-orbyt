import { prisma } from "@mail-orbyt/database";
import { introspectToken, verifyIntrospectionClient } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const INTROSPECT_MAX_ATTEMPTS = 120;
const INTROSPECT_WINDOW_SECONDS = 60 * 60;

const bodySchema = z.object({ token: z.string().min(1) });

function unauthorized(): NextResponse {
  return new NextResponse(null, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="mcp-introspection"' },
  });
}

/**
 * RFC 7662 token introspection — the resource-server-facing counterpart to
 * verifyAccessToken (used in-process by apps/mcp-server). A backend that
 * can't reach mail-orbyt's database directly, like lead_orbyt's MCP server,
 * calls this instead. Deliberately NOT open: the caller must authenticate
 * via HTTP Basic auth as a registered confidential client (see
 * introspection-clients.ts) — a public/PKCE McpOAuthClient can never pass
 * this, since it has no clientSecretHash. ARCHITECTURE.md §6/§7.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `oauth-introspect:${clientIpFrom(request)}`,
    INTROSPECT_MAX_ATTEMPTS,
    INTROSPECT_WINDOW_SECONDS,
  );
  if (!allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Basic ")) return unauthorized();

  let clientId: string;
  let clientSecret: string;
  try {
    const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return unauthorized();
    clientId = decoded.slice(0, separatorIndex);
    clientSecret = decoded.slice(separatorIndex + 1);
  } catch {
    return unauthorized();
  }

  const client = await verifyIntrospectionClient(prisma, { clientId, clientSecret });
  if (!client) return unauthorized();

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

  const result = await introspectToken(prisma, parsed.data.token);
  return NextResponse.json(result);
}
