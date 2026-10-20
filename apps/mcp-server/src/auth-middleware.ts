import type { NextFunction, Request, Response } from "express";
import { prisma } from "@mail-orbyt/database";
import { MAIL_ORBYT_MCP_RESOURCE_URI, verifyAccessToken } from "@mail-orbyt/mcp-oauth";
import { resourceUrl } from "./resource-url.js";

export interface AuthenticatedActor {
  userId: string;
  organisationId: string;
  scope: string;
  clientId: string;
  /** The raw bearer token itself — forwarded as-is to apps/web's REST API, which independently re-verifies it via the same verifyAccessToken function against the same database. */
  rawToken: string;
}

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedActor;
}

function bearerTokenFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/**
 * Resolves the MCP access token on every request to `/mcp`. Per the MCP
 * authorization spec, a 401 here must carry a `WWW-Authenticate` header
 * pointing at this resource's protected-resource metadata, so a compliant
 * client knows where to start the OAuth flow rather than looping forever.
 *
 * verifyAccessToken() only checks that the token itself is unrevoked and
 * unexpired — it says nothing about who it was minted FOR. A token audienced
 * to the Gateway or to lead_orbyt (via the RFC 8693 token-exchange grant,
 * ARCHITECTURE.md §4.2/§6) is just as "valid" by that measure, so this
 * resource server additionally checks the token's `resource` (RFC 8707)
 * equals its own resource identity — MAIL_ORBYT_MCP_RESOURCE_URI, the
 * logical audience identifier every mail-orbyt-issued token is stamped
 * with, NOT resourceUrl() (that's this server's dereferenceable HTTP
 * address, used only for the WWW-Authenticate/protected-resource-metadata
 * pointer below, a distinct concern from token audience binding). Without
 * this check, a token minted for a different resource would still pass
 * verification here and reach mail-orbyt's own tools — the RFC 8707
 * "confused deputy" case ARCHITECTURE.md §4.3 calls out explicitly.
 */
export function mcpAuthMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const rawToken = bearerTokenFrom(req);
    const verified = rawToken ? await verifyAccessToken(prisma, rawToken) : null;
    const audienceMatches = verified?.resource === MAIL_ORBYT_MCP_RESOURCE_URI;

    if (!verified || !rawToken || !audienceMatches) {
      // Must point at THIS resource server's own protected-resource
      // metadata — never at APP_URL. The two are different origins/paths
      // in every real deployment, and apps/web doesn't even serve this
      // route (only `/.well-known/oauth-authorization-server` does); a
      // client following APP_URL here would 404 and never discover how to
      // authenticate.
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceUrl()}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    req.actor = { ...verified, rawToken };
    next();
  };
}
