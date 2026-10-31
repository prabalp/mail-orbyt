import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { createLogger } from "@mail-orbyt/logging";
import { ALL_SCOPES } from "@mail-orbyt/mcp-oauth";
import express from "express";
import { type AuthenticatedRequest, mcpAuthMiddleware } from "./auth-middleware.js";
import { createMcpServer } from "./create-server.js";
import { mcpRateLimitMiddleware } from "./rate-limit.js";
import { resourceUrl } from "./resource-url.js";
import { ALL_LINK_TOOLS, ALL_TOOLS } from "./tools/index.js";

const env = loadEnv();
const logger = createLogger({ service: "mcp-server", level: env.LOG_LEVEL });

const app = express();

// Browser-based MCP clients (e.g. MCP Inspector) call this server
// cross-origin. Auth is a bearer token, never a cookie, so a wildcard origin
// grants nothing a non-browser client couldn't already do. Clients must be
// able to read WWW-Authenticate (to start OAuth) and Mcp-Session-Id.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  );
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok" });
  } catch (error) {
    logger.error("readiness check failed", { error });
    res.status(503).json({ status: "not-ready" });
  }
});

// RFC 9728 OAuth Protected Resource Metadata — tells a connecting MCP
// client which authorization server (apps/web) it must use to obtain an
// access token for this resource.
//
// Served at both the root and the path-suffixed location: since the
// 2025-06-18 spec, clients try `/.well-known/oauth-protected-resource/mcp`
// (derived from the endpoint path) before the root.
const authServerUrl = env.APP_URL.replace(/\/+$/, "");
const protectedResourceMetadata = {
  resource: resourceUrl(),
  authorization_servers: [authServerUrl],
  scopes_supported: ALL_SCOPES,
  bearer_methods_supported: ["header"],
  resource_name: "Mail Orbyt",
};
app.get(
  ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"],
  (_req, res) => {
    res.json(protectedResourceMetadata);
  },
);

// Some MCP clients' automatic 401-triggered auth flow assumes the OAuth
// endpoints live at conventional paths on the RESOURCE server's own origin
// (this process), rather than always resolving them from the discovered
// authorization-server metadata (apps/web). These proxy straight through to
// the real authorization server so such clients work anyway.
//
// The body is forwarded byte-for-byte with its original Content-Type (the
// token endpoint is normally form-encoded), along with Authorization and the
// caller's IP — apps/web rate-limits these endpoints per client IP, and
// without X-Forwarded-For every proxied client would share one bucket.
async function proxyToAuthServer(
  path: string,
  req: express.Request,
  res: express.Response,
): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    const requestContentType = req.headers["content-type"];
    if (requestContentType) headers["Content-Type"] = requestContentType;
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    const clientIp = req.socket.remoteAddress;
    const forwardedFor = req.headers["x-forwarded-for"];
    const priorHops = Array.isArray(forwardedFor) ? forwardedFor.join(", ") : forwardedFor;
    const chain = [priorHops, clientIp].filter(Boolean).join(", ");
    if (chain) headers["X-Forwarded-For"] = chain;

    const hasBody = req.method !== "GET" && req.method !== "HEAD" && Buffer.isBuffer(req.body);
    const upstream = await fetch(`${authServerUrl}${path}`, {
      method: req.method,
      headers,
      body: hasBody ? new Uint8Array(req.body as Buffer) : undefined,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("content-type", contentType);
    res.send(text);
  } catch (error) {
    logger.error("OAuth compatibility proxy failed", { error, path });
    res.status(502).json({ error: "bad_gateway" });
  }
}

const rawBody = express.raw({ type: () => true, limit: "64kb" });
app.post(
  "/register",
  rawBody,
  (req, res) => void proxyToAuthServer("/api/oauth/register", req, res),
);
app.post("/token", rawBody, (req, res) => void proxyToAuthServer("/api/oauth/token", req, res));
app.post("/revoke", rawBody, (req, res) => void proxyToAuthServer("/api/oauth/revoke", req, res));
app.get("/authorize", (req, res) => {
  // Forward the query string untouched (re-serialising req.query would
  // mangle repeated or array-valued parameters).
  const queryIndex = req.originalUrl.indexOf("?");
  const queryString = queryIndex === -1 ? "" : req.originalUrl.slice(queryIndex);
  res.redirect(`${authServerUrl}/oauth/authorize${queryString}`);
});
// Clients written against the 2025-03-26 spec skip protected-resource
// metadata and look for authorization-server metadata on the MCP server's
// own origin. Serving apps/web's document here points them at the real
// endpoints.
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  void proxyToAuthServer("/.well-known/oauth-authorization-server", req, res);
});

// Stateless server: there is no standalone SSE stream to open (GET) and no
// session to terminate (DELETE). The spec requires 405 here, which clients
// treat as "not supported"; a 404 can make some of them give up.
app.all(["/mcp"], (req, res, next) => {
  if (req.method === "POST") {
    next();
    return;
  }
  res.setHeader("Allow", "POST, OPTIONS");
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." },
    id: null,
  });
});

app.post(
  "/mcp",
  express.json({ limit: "4mb" }),
  mcpAuthMiddleware(),
  mcpRateLimitMiddleware(),
  async (req: AuthenticatedRequest, res) => {
    const actor = req.actor;
    if (!actor) {
      // mcpAuthMiddleware already responded in this case; this is unreachable.
      return;
    }

    const server = createMcpServer(actor);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("failed to handle MCP request", { error, userId: actor.userId });
      if (!res.headersSent) {
        res.status(500).json({ error: "internal_error" });
      }
    }
  },
);

const httpServer = app.listen(env.MCP_SERVER_PORT, () => {
  logger.info("mcp-server started", {
    environment: env.NODE_ENV,
    port: env.MCP_SERVER_PORT,
    toolCount: ALL_TOOLS.length + ALL_LINK_TOOLS.length,
  });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("mcp-server shutting down", { signal });

  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();

  logger.info("mcp-server shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
