import { z } from "zod";

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

  // Object storage (S3-compatible)
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // AI provider (packages/email-generation ONLY)
  AI_PROVIDER_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(600),

  // External research providers
  SEARCH_PROVIDER_API_KEY: z.string().optional(),
  NEWS_PROVIDER_API_KEY: z.string().optional(),
  ENRICHMENT_PROVIDER_API_KEY: z.string().optional(),

  // Email sending safety
  EMERGENCY_STOP: z.coerce.boolean().default(false),

  // Observability
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
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
