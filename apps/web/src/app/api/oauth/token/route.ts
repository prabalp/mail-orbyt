import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { exchangeAuthorizationCode, OAuthGrantError, refreshAccessToken } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const TOKEN_MAX_ATTEMPTS = 30;
const TOKEN_WINDOW_SECONDS = 60 * 60;

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

const bodySchema = z.discriminatedUnion("grant_type", [authorizationCodeSchema, refreshTokenSchema]);

function oauthError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: code }, { status });
}

/** OAuth 2.1 token endpoint — handles the authorization_code exchange (with PKCE) and refresh_token rotation for the MCP remote connector's public client. */
export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `oauth-token:${clientIpFrom(request)}`,
    TOKEN_MAX_ATTEMPTS,
    TOKEN_WINDOW_SECONDS,
  );
  if (!allowed) return oauthError("too_many_requests", 429);

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
  if (!parsed.success) return oauthError("invalid_request", 400);

  const env = loadEnv();

  try {
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
