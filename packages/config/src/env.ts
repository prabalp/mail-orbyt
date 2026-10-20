import { z } from "zod";

/**
 * z.coerce.boolean() runs the JS `Boolean()` constructor on the raw env
 * string, and `Boolean("false")` is `true` — any non-empty string coerces
 * to true, which silently inverted the intended meaning of `X=false` in a
 * .env file (caught live: EMERGENCY_STOP=false was making the outbox
 * worker treat the kill switch as engaged). This parses the literal
 * strings "true"/"false"/"1"/"0" instead.
 */
function booleanEnvVar(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return defaultValue;
      return value.toLowerCase() === "true" || value === "1";
    });
}

/**
 * Central environment schema. Every environment variable the platform reads
 * must be declared here — no `process.env.X` access is permitted outside
 * this package. Validation happens once at process startup; a misconfigured
 * deployment fails fast instead of failing on first request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Core application
  APP_URL: z.string().url(),
  APP_NAME: z.string().default("Mail Orbyt"),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis / queues
  REDIS_URL: z.string().url(),

  // Auth.js
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),

  // Google OAuth — application login (NOT Gmail sending; see GMAIL_* below)
  GOOGLE_LOGIN_CLIENT_ID: z.string().min(1),
  GOOGLE_LOGIN_CLIENT_SECRET: z.string().min(1),

  // Google OAuth — Gmail sending inboxes (separate client/app from login)
  GMAIL_OAUTH_CLIENT_ID: z.string().min(1),
  GMAIL_OAUTH_CLIENT_SECRET: z.string().min(1),
  GMAIL_OAUTH_REDIRECT_URI: z.string().url(),

  // Encryption for tokens at rest (AES-256-GCM key, base64, 32 bytes)
  TOKEN_ENCRYPTION_KEY: z.string().min(1),

  // Social platform OAuth (packages/social-platforms) — all optional since a
  // deployment may only have some of these platforms' apps configured.
  LINKEDIN_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_OAUTH_REDIRECT_URI: z.string().url().optional(),

  TWITTER_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  TWITTER_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  TWITTER_OAUTH_REDIRECT_URI: z.string().url().optional(),

  REDDIT_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  REDDIT_OAUTH_REDIRECT_URI: z.string().url().optional(),
  REDDIT_USER_AGENT: z.string().min(1).optional(),

  META_OAUTH_APP_ID: z.string().min(1).optional(),
  META_OAUTH_APP_SECRET: z.string().min(1).optional(),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),

  // Object storage (S3-compatible)
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: booleanEnvVar(true),

  // AI provider (packages/email-generation ONLY) — Google Gemini API
  AI_PROVIDER_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER_MODEL: z.string().default("gemini-2.5-flash"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(600),

  // External research providers
  SEARCH_PROVIDER_API_KEY: z.string().optional(),
  NEWS_PROVIDER_API_KEY: z.string().optional(),
  ENRICHMENT_PROVIDER_API_KEY: z.string().optional(),

  // Keyword extraction mode for packages/research-keywords. Defaults to the
  // deterministic (non-AI) extractor; "ai" is an explicit opt-in — see
  // docs/ai-boundaries.md.
  KEYWORD_EXTRACTION_MODE: z.enum(["deterministic", "ai"]).default("deterministic"),

  // Transactional email provider (verification, password reset,
  // invitations) — Resend. Optional: unset falls back to logging emails to
  // the console instead of sending them (local dev default).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().default("onboarding@resend.dev"),

  // Email sending safety
  EMERGENCY_STOP: booleanEnvVar(false),

  // Open-tracking pixel: per-organisation custom domains (packages/tracking).
  // TRACKING_CNAME_TARGET is the stable hostname orgs CNAME their tracking
  // subdomain to (this app's reverse proxy). INTERNAL_ASK_SECRET guards the
  // proxy's on-demand-TLS "ask" callback so it isn't a public oracle for
  // which domains are configured. Both optional: unset simply means no
  // organisation can verify a tracking domain yet.
  TRACKING_CNAME_TARGET: z.string().min(1).optional(),
  INTERNAL_ASK_SECRET: z.string().min(1).optional(),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Remote MCP connector — OAuth 2.1 authorization server (apps/web) and
  // MCP protocol server (apps/mcp-server)
  MCP_SERVER_PORT: z.coerce.number().int().positive().default(3001),
  MCP_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  MCP_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  // The mcp-server's own publicly reachable base URL, advertised in its
  // protected-resource metadata. Unset defaults to APP_URL's host/protocol
  // with MCP_SERVER_PORT substituted in (apps/mcp-server computes this) —
  // override explicitly if it's deployed behind a different host/path than
  // that (e.g. one shared reverse-proxied origin with path-based routing).
  MCP_SERVER_URL: z.string().url().optional(),
  // The Orbyt MCP gateway's RFC 8707 resource URI (the `aud` of platform
  // tokens). Unset disables the gateway flow: authorize rejects it as an
  // unknown resource and token exchange fails closed.
  GATEWAY_RESOURCE_URI: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

/** Test-only: clears the memoized env so tests can reload with different values. */
export function __resetEnvForTests(): void {
  cachedEnv = undefined;
}
