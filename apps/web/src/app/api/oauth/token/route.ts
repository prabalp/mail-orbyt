import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import {
  ACCESS_TOKEN_TYPE,
  exchangeAuthorizationCode,
  exchangeTokenForResource,
  OAuthGrantError,
  refreshAccessToken,
  TOKEN_EXCHANGE_GRANT_TYPE,
} from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const TOKEN_MAX_ATTEMPTS = 30;
const TOKEN_WINDOW_SECONDS = 60 * 60;
// The gateway exchanges on demand (cached ~5 min per user+resource), so it
// legitimately calls far more often than interactive code/refresh grants.
const EXCHANGE_MAX_ATTEMPTS = 3000;

const authorizationCodeSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(1),
});

const refreshTokenSchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1),
  client_id: z.string().min(1),
});

const tokenExchangeSchema = z.object({
  grant_type: z.literal(TOKEN_EXCHANGE_GRANT_TYPE),
  subject_token: z.string().min(1),
  subject_token_type: z.string().min(1).default(ACCESS_TOKEN_TYPE),
  resource: z.string().min(1),
  client_id: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("grant_type", [
  authorizationCodeSchema,
  refreshTokenSchema,
  tokenExchangeSchema,
]);

function oauthError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

/** OAuth 2.1 token endpoint — handles the authorization_code exchange (with PKCE), refresh_token rotation, and the RFC 8693 token-exchange grant (the gateway's silent per-resource exchange). */
export async function POST(request: Request): Promise<NextResponse> {
  // The token endpoint is conventionally form-encoded, but MCP clients
  // commonly send JSON too — accept either.
  const contentType = request.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> | null;
  if (contentType.includes("application/json")) {
    raw = await request.json().catch(() => null);
  } else {
    const form = await request.formData().catch(() => null);
    raw = form ? Object.fromEntries(form.entries()) : null;
  }

  const parsed = bodySchema.safeParse(raw);
  const isExchange = parsed.success && parsed.data.grant_type === TOKEN_EXCHANGE_GRANT_TYPE;
  const allowed = await rateLimiter.attempt(
    `${isExchange ? "oauth-token-exchange" : "oauth-token"}:${clientIpFrom(request)}`,
    isExchange ? EXCHANGE_MAX_ATTEMPTS : TOKEN_MAX_ATTEMPTS,
    TOKEN_WINDOW_SECONDS,
  );
  if (!allowed) return oauthError("too_many_requests", 429);
  if (!parsed.success) return oauthError("invalid_request", 400);

  const env = loadEnv();

  try {
    if (parsed.data.grant_type === TOKEN_EXCHANGE_GRANT_TYPE) {
      const exchanged = await exchangeTokenForResource(prisma, {
        clientId: parsed.data.client_id,
        subjectToken: parsed.data.subject_token,
        subjectTokenType: parsed.data.subject_token_type,
        resource: parsed.data.resource,
        gatewayResourceUri: env.GATEWAY_RESOURCE_URI ?? "",
      });
      return NextResponse.json(
        {
          access_token: exchanged.accessToken,
          token_type: exchanged.tokenType,
          expires_in: exchanged.expiresIn,
          scope: exchanged.scope,
          issued_token_type: exchanged.issuedTokenType,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const result =
      parsed.data.grant_type === "authorization_code"
        ? await exchangeAuthorizationCode(prisma, {
            clientId: parsed.data.client_id,
            rawCode: parsed.data.code,
            redirectUri: parsed.data.redirect_uri,
            codeVerifier: parsed.data.code_verifier,
            accessTokenTtlMs: env.MCP_ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
            refreshTokenTtlMs: env.MCP_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
          })
        : await refreshAccessToken(prisma, {
            clientId: parsed.data.client_id,
            rawRefreshToken: parsed.data.refresh_token,
            accessTokenTtlMs: env.MCP_ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
            refreshTokenTtlMs: env.MCP_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
          });

    return NextResponse.json({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      scope: result.scope,
    });
  } catch (error) {
    if (error instanceof OAuthGrantError) {
      return oauthError(error.code, error.code === "invalid_client" ? 401 : 400);
    }
    throw error;
  }
}
