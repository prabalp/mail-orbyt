import { loadEnv } from "@mail-orbyt/config";

/** Public URL of apps/mcp-server — the `resource` value pre-gateway connectors send, mapped to mail-orbyt's own resource URI at authorize time. Mirrors apps/mcp-server's resourceUrl(). */
export function mcpServerPublicUrl(): string {
  const env = loadEnv();
  if (env.MCP_SERVER_URL) return env.MCP_SERVER_URL;
  const url = new URL(env.APP_URL);
  url.port = String(env.MCP_SERVER_PORT);
  return url.toString();
}
