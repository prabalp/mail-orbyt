# Deployment

This document covers taking Mail Orbyt from local development to a real
deployment. It assumes familiarity with `docs/local-development.md` and
`docs/environment-variables.md`.

## Architecture recap

Three deployable processes, plus managed infrastructure:

- **`apps/web`** — Next.js app (UI + API routes). Stateless; scale
  horizontally behind a load balancer.
- **`apps/worker`** — BullMQ worker process (lead import, research, campaign
  scheduler tick, outbox sends, reply sync). Also stateless per-instance,
  but see "Scaling the worker" below for concurrency considerations.
- **PostgreSQL** — primary datastore. Run migrations (`prisma migrate
deploy`, not `migrate dev`) before starting new app/worker instances on a
  schema change.
- **Redis** — BullMQ job queues and (as of Phase 12) the rate limiter's
  counters. A managed Redis (ElastiCache, Upstash, etc.) is recommended in
  production; the docker-compose Redis is dev-only.
- **S3-compatible object storage** — CSV import uploads. The docker-compose
  MinIO is dev-only; point `STORAGE_*` at a real bucket (S3, R2,
  Spaces, etc.) in production.

## Before every deploy

1. **Run migrations**: `pnpm --filter @mail-orbyt/database exec prisma migrate deploy`
   against the production database, from a controlled environment (CI/CD
   pipeline or a bastion host) — never `migrate dev` against production,
   since it can prompt interactively and is meant for local iteration.
2. **Run the full validation suite** (this is what CI already runs on every
   push — see `.github/workflows/ci.yml`): format check, typecheck, lint,
   unit tests, architecture (AI-boundary) tests, integration tests against
   real Postgres/Redis, and a production build. A deploy should never
   proceed if any of these fail.
3. **Build with `NODE_ENV` unset in the shell** before running `pnpm build`
   — Next.js sets `NODE_ENV=production` internally during its own build
   step; a pre-set `NODE_ENV` in the surrounding shell overrides that and
   causes a confusing, unrelated build failure. Documented in
   `.github/workflows/ci.yml`'s top-level comment and followed throughout
   this project's own build commands.

## Environment variables checklist

See `docs/environment-variables.md` for the full reference. Production-
specific call-outs:

- `AUTH_SECRET` / `TOKEN_ENCRYPTION_KEY` — generate fresh, random values
  per environment (`openssl rand -base64 32`) — never reuse the values from
  `.env.example` or a lower environment.
- `GOOGLE_LOGIN_CLIENT_ID/SECRET` and `GMAIL_OAUTH_CLIENT_ID/SECRET` — two
  **separate** Google Cloud OAuth clients, matching the product's
  requirement that login and Gmail-sending credentials never share a
  token. Both need their redirect URIs registered in Google Cloud Console
  for the production domain.
- `EMERGENCY_STOP` — the global sending kill switch (Phase 8). Set to
  `true` to immediately halt all outbound sending across every
  organisation without a deploy — useful during an incident. **Important**:
  this must be the literal string `true`/`false` (or `1`/`0`) — see the
  `docs/scheduling-sending.md` writeup of the `z.coerce.boolean()` bug this
  project hit and fixed; `packages/config`'s schema now parses these
  literal strings correctly, but any _new_ boolean env var added in the
  future should reuse the `booleanEnvVar()` helper rather than
  `z.coerce.boolean()`.
- `AI_PROVIDER_API_KEY` — optional. Without it, AI email generation
  (Phase 5) shows a "not configured" state rather than failing; set it to
  enable the feature for real.
- `SEARCH_PROVIDER_API_KEY` / `NEWS_PROVIDER_API_KEY` /
  `ENRICHMENT_PROVIDER_API_KEY` — optional; research falls back to
  website/JSON-LD extraction alone when unset (Phase 4).

## Rate limiting requires Redis (Phase 12)

`apps/web/src/lib/auth.ts` and `apps/web/src/lib/rate-limit.ts` construct a
Redis-backed rate limiter (`createRedisRateLimiter`) using the same
`REDIS_URL` connection as the BullMQ queues. This is a **hard requirement**
for the brute-force/spam protections on login, sign-up, and
forgot-password to actually work correctly across multiple `apps/web`
instances — an in-memory fallback would reset per-instance and per-restart,
defeating the point. If Redis is unreachable at startup, the app will fail
to connect rather than silently falling back to no rate limiting.

## Behind a reverse proxy / load balancer

`apps/web/src/lib/rate-limit.ts`'s `clientIpFrom()` trusts the
`x-forwarded-for` header to identify the real client IP for IP-based rate
limiting (sign-up, forgot-password). This is only safe when the app is
deployed behind a trusted reverse proxy/load balancer that itself sets (and
strips any client-supplied) `x-forwarded-for` — if the app is ever exposed
directly to the internet without such a proxy, a client could spoof this
header to bypass IP-based rate limiting. Standard behavior for
Vercel/most managed platforms and any properly configured nginx/ALB
front-end; just don't skip the proxy layer.

## Security headers and TLS

`apps/web/next.config.mjs` sets `X-Frame-Options`,
`Content-Security-Policy: frame-ancestors 'none'`,
`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on
every response (Phase 12). TLS termination itself is expected to happen at
the load balancer/CDN layer, not in the Next.js app — ensure
`AUTH_URL`/`APP_URL` use `https://` in production so Auth.js issues secure
cookies.

## Scaling the worker

`apps/worker` registers four BullMQ workers (lead-import, research,
campaign-scheduler, outbox) in one process. The campaign-scheduler's
repeatable tick is registered via `upsertJobScheduler`, which BullMQ
dedupes by job-scheduler ID — running multiple worker instances is safe
and won't create duplicate recurring ticks or duplicate sends (the outbox
pattern's idempotency, Phase 8, holds regardless of how many worker
instances are consuming the queue). Scale `apps/worker` horizontally by
running more instances; BullMQ's `concurrency` option (already set per
worker) controls in-process parallelism.

## Observability

- **Logging**: `packages/logging` produces structured JSON logs
  (`createLogger`), already used throughout `apps/worker` and API error
  paths — ship these to your log aggregator of choice (CloudWatch, Datadog,
  etc.) via the container runtime's stdout capture.
- **Audit trail**: `AuditEvent` (Postgres) records every
  security/compliance-relevant action (login, password reset, invitations,
  membership changes, inbox connection, campaign launch/pause, suppression,
  data export/deletion) — query this table directly for incident
  investigation; there's no separate audit UI yet.
- **Health/readiness**: `GET /api/health` (liveness — the process is up)
  and `GET /api/ready` (readiness — Postgres is actually reachable via a
  real `SELECT 1`) are already wired for a container orchestrator's
  health-check probes.

## What is intentionally not covered here

Dependency vulnerability scanning (`pnpm audit`/Snyk), a WAF/DDoS layer,
and a real load/capacity test against a production build are called out as
explicitly out of scope for this project's own build process — see
`docs/security-audit.md`'s "What was deliberately left out of scope"
section for the reasoning. Add these as CI/infrastructure steps specific
to the actual hosting platform chosen for a real deployment.
