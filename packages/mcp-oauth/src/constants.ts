export const AUTHORIZATION_CODE_TTL_MS = 60 * 1000; // 60 seconds — single use, exchanged immediately after redirect.
export const DEFAULT_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Exchanged per-resource tokens are deliberately short-lived (ARCHITECTURE.md §4.2) — the gateway re-exchanges on demand. */
export const EXCHANGED_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Logical RFC 8707 audience identifiers — NOT HTTP URLs. Must match the
 * McpResource rows seeded by the migration and the gateway's
 * MAIL_ORBYT_MCP_RESOURCE_URI / LEAD_ORBYT_MCP_RESOURCE_URI env values.
 */
export const MAIL_ORBYT_MCP_RESOURCE_URI = "urn:orbyt:mail-orbyt-mcp-server";
export const LEAD_ORBYT_MCP_RESOURCE_URI = "urn:orbyt:lead-orbyt-mcp-server";

export const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
export const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

export const RESOURCE_KIND_GATEWAY = "gateway";
export const RESOURCE_KIND_NATIVE_LOCAL = "native-local";
export const RESOURCE_KIND_NATIVE_INTROSPECTED = "native-introspected";
