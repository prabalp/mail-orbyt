import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

const QUIET_PATHS = new Set(["/api/health", "/api/ready"]);

/**
 * Public OAuth endpoints an MCP client talks to directly. Browser-based
 * clients (e.g. MCP Inspector) call these cross-origin, so they need CORS.
 * None of them use cookies, so a wildcard origin is safe. Introspection is
 * deliberately excluded — it's server-to-server with a client secret.
 */
const OAUTH_CORS_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
]);

const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isOAuthCors = OAUTH_CORS_PATHS.has(path);
  if (isOAuthCors && request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  if (isOAuthCors) {
    for (const [name, value] of Object.entries(OAUTH_CORS_HEADERS)) {
      response.headers.set(name, value);
    }
  }

  if (!QUIET_PATHS.has(path)) {
    logger.info("request", {
      requestId,
      method: request.method,
      path,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
