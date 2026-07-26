# Local development

## Prerequisites

- Node.js 20+
- pnpm 9.15+ (`corepack enable` will pick up the pinned version from
  `package.json#packageManager`)
- Docker (for PostgreSQL, Redis, and local S3-compatible storage)

## Setup

```bash
cp .env.example .env
# Fill in AUTH_SECRET and TOKEN_ENCRYPTION_KEY at minimum:
#   openssl rand -base64 32

docker compose up -d

pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Running

```bash
pnpm dev              # runs apps/web and apps/worker in parallel via turbo
```

- Web: http://localhost:3000
- Health check: http://localhost:3000/api/health
- Readiness check: http://localhost:3000/api/ready
- MinIO console: http://localhost:9001 (minioadmin/minioadmin)

## Commands

```bash
pnpm build              # production build of all apps/packages
pnpm lint               # ESLint across the workspace
pnpm typecheck          # tsc --noEmit across the workspace
pnpm format             # Prettier write
pnpm format:check       # Prettier check (used in CI)
pnpm test               # Vitest unit tests
pnpm test:architecture  # architecture boundary tests only
pnpm test:integration    # integration tests (added from Phase 2 onward)
pnpm test:e2e            # Playwright tests (added from Phase 2 onward)
```

## Seed data

Phase 0 seeds only the `emergency_stop` feature flag. As each phase lands, the
seed script (`packages/database/prisma/seed.ts`) grows to include: a seed
organisation with a user for every role (OWNER/ADMIN/MEMBER/VIEWER), sample
leads and companies, sample research facts, a draft campaign, a mock
connected inbox, and sample conversation/meeting data — matching the spec's
required local dev fixtures. No real credentials are ever included in seed
data.

## Environment variables

See `docs/environment-variables.md` for the full list. `.env.example`
documents every variable inline.
