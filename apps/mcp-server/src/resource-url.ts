import { loadEnv } from "@mail-orbyt/config";

// Default: same host/protocol as APP_URL, but this process's own port — the
// common case of running web and mcp-server as separate local processes (or
// separate containers on one host). A production deployment that puts both
// behind one reverse-proxied origin (e.g. a path-based route) should set
// MCP_SERVER_URL explicitly instead.
function defaultResourceUrl(): string {
  const env = loadEnv();
  const url = new URL(env.APP_URL);
  url.port = String(env.MCP_SERVER_PORT);
  return url.toString();
}

/**
 * This resource server's own public URL — never APP_URL. The two are
 * different origins/paths in every real deployment (mcp-server always runs
 * as its own process on its own port, even when reverse-proxied behind the
 * same domain as the web app via a path prefix), so anything that needs to
 * point a client back AT this server — the `resource` field in protected-
 * resource metadata, and the `WWW-Authenticate` header's `resource_metadata`
 * — must be built from this, not from APP_URL.
 */
export function resourceUrl(): string {
  const env = loadEnv();
  return (env.MCP_SERVER_URL ?? defaultResourceUrl()).replace(/\/$/, "");
}
