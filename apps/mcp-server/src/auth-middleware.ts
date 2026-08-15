import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { verifyAccessToken } from "@mail-orbyt/mcp-oauth";

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
 */
export function mcpAuthMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const rawToken = bearerTokenFrom(req);
    const verified = rawToken ? await verifyAccessToken(prisma, rawToken) : null;

    if (!verified || !rawToken) {
      const issuer = loadEnv().APP_URL;
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    req.actor = { ...verified, rawToken };
    next();
  };
}
