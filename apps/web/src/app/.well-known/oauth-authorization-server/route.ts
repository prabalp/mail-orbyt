import { loadEnv } from "@mail-orbyt/config";
import { ALL_SCOPES, TOKEN_EXCHANGE_GRANT_TYPE } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), discovered by the MCP
 * remote connector before it registers a client or starts the authorization
 * flow. Public clients only, PKCE-only — no client secret, no "plain"
 * challenge method.
 */
export async function GET(): Promise<NextResponse> {
  const issuer = loadEnv().APP_URL;

  return NextResponse.json({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    introspection_endpoint: `${issuer}/api/oauth/introspect`,
    introspection_endpoint_auth_methods_supported: ["client_secret_basic"],
    scopes_supported: ALL_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", TOKEN_EXCHANGE_GRANT_TYPE],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
