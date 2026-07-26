# Environment variables

All environment variables are declared and validated in
`packages/config/src/env.ts` (Zod schema). The application fails fast at
startup if a required variable is missing or malformed — no runtime surprise
from an unset variable deep in a request path.

| Variable                                                                                                                                      | Required                                    | Description                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                                                                                                                    | no (default `development`)                  | `development` \| `test` \| `production`                                                    |
| `APP_URL`                                                                                                                                     | yes                                         | Public base URL of the web app                                                             |
| `APP_NAME`                                                                                                                                    | no                                          | Display name                                                                               |
| `DATABASE_URL`                                                                                                                                | yes                                         | PostgreSQL connection string                                                               |
| `DATABASE_POOL_MAX`                                                                                                                           | no (default 10)                             | Prisma connection pool size                                                                |
| `REDIS_URL`                                                                                                                                   | yes                                         | Redis connection string (BullMQ + caching)                                                 |
| `AUTH_SECRET`                                                                                                                                 | yes                                         | Auth.js session signing secret (`openssl rand -base64 32`)                                 |
| `AUTH_URL`                                                                                                                                    | yes                                         | Auth.js canonical URL                                                                      |
| `GOOGLE_LOGIN_CLIENT_ID` / `GOOGLE_LOGIN_CLIENT_SECRET`                                                                                       | yes                                         | OAuth client for **application sign-in** only                                              |
| `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` / `GMAIL_OAUTH_REDIRECT_URI`                                                            | yes                                         | Separate OAuth client for **Gmail sending inboxes** — never reuse login tokens for sending |
| `TOKEN_ENCRYPTION_KEY`                                                                                                                        | yes                                         | AES-256-GCM key (base64, 32 bytes) for encrypting OAuth tokens at rest                     |
| `STORAGE_ENDPOINT` / `STORAGE_REGION` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_FORCE_PATH_STYLE` | yes                                         | S3-compatible object storage (CSV uploads, evidence snapshots, exports)                    |
| `AI_PROVIDER_API_KEY`                                                                                                                         | only in `packages/email-generation` runtime | AI provider key — never read outside that package                                          |
| `AI_PROVIDER_MODEL`                                                                                                                           | no (default `claude-haiku-4-5-20251001`)    | Model identifier used for generation                                                       |
| `AI_MAX_OUTPUT_TOKENS`                                                                                                                        | no (default 600)                            | Hard cap on generation output tokens                                                       |
| `SEARCH_PROVIDER_API_KEY` / `NEWS_PROVIDER_API_KEY` / `ENRICHMENT_PROVIDER_API_KEY`                                                           | no                                          | Optional research providers (Phase 4)                                                      |
| `EMERGENCY_STOP`                                                                                                                              | no (default `false`)                        | Organisation-wide kill switch checked before every send                                    |
| `LOG_LEVEL`                                                                                                                                   | no (default `info`)                         | `debug` \| `info` \| `warn` \| `error`                                                     |

## Secret rotation

- `AUTH_SECRET`: rotating invalidates all active sessions. Rotate during a
  maintenance window; users are prompted to sign in again.
- `TOKEN_ENCRYPTION_KEY`: rotating requires re-encrypting all stored OAuth
  tokens with the new key before removing the old one (dual-key decrypt
  window). Documented in full once `packages/gmail` lands in Phase 6.
- Provider API keys (`AI_PROVIDER_API_KEY`, research providers): rotate at
  the provider dashboard, then update the deployment secret store; no
  application-level migration needed since these are not persisted.
