import { loadEnv } from "@mail-orbyt/config";
import { ALL_SCOPES } from "@mail-orbyt/mcp-oauth";
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
    // Not exposed for public/PKCE clients to call directly — only a
    // registered confidential client (see introspection-clients.ts) can
    // authenticate against it. Still advertised here per RFC 7662/8414.
    introspection_endpoint: `${issuer}/api/oauth/introspect`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "urn:ietf:params:oauth:grant-type:token-exchange",
    ],
    code_challenge_methods_supported: ["S256"],
    // Public/PKCE clients use "none" at the authorize/token endpoints, same
    // as before; confidential introspection callers authenticate separately
    // via HTTP Basic auth directly against introspection_endpoint.
    token_endpoint_auth_methods_supported: ["none"],
    resource_indicators_supported: true,
  });
}
