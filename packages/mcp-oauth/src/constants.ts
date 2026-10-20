export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000; // 60 seconds — single use, exchanged immediately after redirect.
export const DEFAULT_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// RFC 8693 token-exchange grant (ARCHITECTURE.md §4.2/§6): a resource-scoped
// token is deliberately short-lived and never refreshed directly — the
// Gateway just re-exchanges the still-valid platform token when it expires.
export const RESOURCE_SCOPED_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Logical resource identifiers (RFC 8707), not runtime HTTP URLs — a
// deployment's actual APP_URL/MCP_SERVER_URL varies per environment, but
// the audience a token is scoped to shouldn't. These must exactly match
// the values seeded into McpResource by migration
// 20260928103901_mcp_platform_grants_and_resources and the value existing
// rows were backfilled to.
export const MAIL_ORBYT_MCP_RESOURCE_URI = "urn:orbyt:mail-orbyt-mcp-server";
export const LEAD_ORBYT_MCP_RESOURCE_URI = "urn:orbyt:lead-orbyt-mcp-server";
