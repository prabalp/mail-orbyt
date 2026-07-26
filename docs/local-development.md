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

## Gotcha: NODE_ENV and `pnpm build`

Don't `source .env` (or otherwise export `NODE_ENV=development`) into the
shell before running `pnpm build` / `next build`. Next.js sets its own
`NODE_ENV=production` internally during the build; a pre-set `NODE_ENV` in
the shell environment overrides that and triggers a confusing, unrelated
failure during static page generation (`<Html> should not be imported
outside of pages/_document`, on `/404` or `/500`). If you need env vars from
`.env` loaded for a one-off build, export everything except `NODE_ENV`, or
run `unset NODE_ENV` right before the build command. `next dev` is
unaffected — this only bites the production build.

## Seed data

`pnpm db:seed` creates the `emergency_stop` feature flag and a demo
organisation ("Demo Organisation") with one verified user per role:

| Email                        | Password           | Role   |
| ---------------------------- | ------------------ | ------ |
| `owner@demo.mailorbyt.test`  | `Sup3rSecretPass1` | OWNER  |
| `admin@demo.mailorbyt.test`  | `Sup3rSecretPass1` | ADMIN  |
| `member@demo.mailorbyt.test` | `Sup3rSecretPass1` | MEMBER |
| `viewer@demo.mailorbyt.test` | `Sup3rSecretPass1` | VIEWER |

These are local-only fixtures — not real credentials, and the `.test` TLD
ensures the email addresses can never resolve to a real mailbox. As each
later phase lands, the seed script (`packages/database/prisma/seed.ts`)
grows to include sample leads and companies, sample research facts, a draft
campaign, a mock connected inbox, and sample conversation/meeting data. No
real credentials are ever included in seed
data.

## Environment variables

See `docs/environment-variables.md` for the full list. `.env.example`
documents every variable inline.
