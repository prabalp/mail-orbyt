import { prisma } from "@mail-orbyt/database";
import { registerClient } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const REGISTER_MAX_ATTEMPTS = 20;
const REGISTER_WINDOW_SECONDS = 60 * 60;

const bodySchema = z.object({
  client_name: z.string().min(1).max(200).default("MCP client"),
  redirect_uris: z.array(z.string().url()).min(1),
});

/** OAuth 2.0 Dynamic Client Registration (RFC 7591) — public, unauthenticated, but rate-limited by IP since it creates a database row per call. */
export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `oauth-register:${clientIpFrom(request)}`,
    REGISTER_MAX_ATTEMPTS,
    REGISTER_WINDOW_SECONDS,
  );
  if (!allowed) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const client = await registerClient(prisma, {
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
