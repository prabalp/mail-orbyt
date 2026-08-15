import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { createLogger } from "@mail-orbyt/logging";
import express from "express";
import { type AuthenticatedRequest, mcpAuthMiddleware } from "./auth-middleware.js";
import { createMcpServer } from "./create-server.js";
import { mcpRateLimitMiddleware } from "./rate-limit.js";
import { resourceUrl } from "./resource-url.js";
import { ALL_LINK_TOOLS, ALL_TOOLS } from "./tools/index.js";

const env = loadEnv();
const logger = createLogger({ service: "mcp-server", level: env.LOG_LEVEL });

const app = express();
app.use(express.json());

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
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: resourceUrl(),
    authorization_servers: [env.APP_URL.replace(/\/$/, "")],
  });
});

// Some MCP clients' automatic 401-triggered auth flow assumes the OAuth
// endpoints live at conventional paths on the RESOURCE server's own origin
// (this process), rather than always resolving them from the discovered
// authorization-server metadata (apps/web). These proxy straight through to
// the real authorization server so such clients work anyway.
const authServerUrl = env.APP_URL.replace(/\/$/, "");

async function proxyToAuthServer(path: string, req: express.Request, res: express.Response): Promise<void> {
  try {
    const upstream = await fetch(`${authServerUrl}${path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body ?? {}),
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

app.post("/register", (req, res) => void proxyToAuthServer("/api/oauth/register", req, res));
app.post("/token", (req, res) => void proxyToAuthServer("/api/oauth/token", req, res));
app.post("/revoke", (req, res) => void proxyToAuthServer("/api/oauth/revoke", req, res));
app.get("/authorize", (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  res.redirect(`${authServerUrl}/oauth/authorize${queryString ? `?${queryString}` : ""}`);
});

app.post("/mcp", mcpAuthMiddleware(), mcpRateLimitMiddleware(), async (req: AuthenticatedRequest, res) => {
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
});

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
