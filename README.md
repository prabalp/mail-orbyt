# Mail Orbyt

An AI-assisted outbound email operating system: research prospects
deterministically, generate personalised emails from verified facts only,
send across rotated Google Workspace inboxes within configured limits, and
measure outcomes against **qualified meeting rate** — qualified meetings
booked divided by unique prospects contacted.

## Status

Built in 13 phases (0–12), each implemented, tested, and audited before the
next begins.

| Phase | Scope                                                           | Status |
| ----- | --------------------------------------------------------------- | ------ |
| 0     | Repo scaffold, tooling, Docker, CI, architecture boundary tests | ✅     |
| 1     | Material 3 design system + application shell                    | ✅     |
| 2     | Authentication, organisations, roles, invitations               | ⬜     |
| 3     | CSV import, leads, companies, suppression foundation            | ⬜     |
| 4     | Deterministic research and enrichment                           | ⬜     |
| 5     | Controlled AI email generation                                  | ⬜     |
| 6     | Google Workspace OAuth, inbox management, DNS checks            | ⬜     |
| 7     | Campaign and sequence builder                                   | ⬜     |
| 8     | Scheduler, inbox rotation, outbox, sending                      | ⬜     |
| 9     | Replies, follow-ups, conversations, retargeting                 | ⬜     |
| 10    | Meetings, attribution, analytics                                | ⬜     |
| 11    | Safety, compliance, export/deletion/retention                   | ⬜     |
| 12    | Security audit, load testing, hardening, deployment docs        | ⬜     |

## Quick start

See [`docs/local-development.md`](docs/local-development.md).

```bash
cp .env.example .env   # fill in AUTH_SECRET and TOKEN_ENCRYPTION_KEY
docker compose up -d
pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
```

## Documentation

- [Architecture](docs/architecture.md)
- [AI usage boundaries](docs/ai-boundaries.md)
- [Design system](docs/design-system.md)
- [Local development](docs/local-development.md)
- [Environment variables](docs/environment-variables.md)

Further docs (database schema, Gmail OAuth setup, scheduler, outbox pattern,
reply sync, suppression, analytics definitions, deployment, backup/restore,
incident response) are added as their corresponding phase lands.

## Repository structure

```
apps/
  web/            Next.js App Router — UI and API route handlers
  worker/         BullMQ background job processors
packages/
  database/       Prisma schema and client (only package with direct DB access)
  config/         Environment variable validation
  validation/      Shared Zod schemas
  design-system/   Material 3 tokens and components (Phase 1)
  authentication/  Auth.js, roles, sessions (Phase 2)
  leads/           Lead import, normalisation, lists (Phase 3)
  research/        Deterministic enrichment providers (Phase 4)
  email-generation/  AI generation — the ONLY package allowed to import an AI SDK (Phase 5)
  gmail/           Gmail OAuth and sending (Phase 6)
  campaigns/       Campaign and sequence builder (Phase 7)
  scheduling/      Scheduler, inbox rotation, outbox (Phase 8)
  conversations/   Reply sync, classification, retargeting (Phase 9)
  analytics/       Metrics and dashboards (Phase 10)
  compliance/      Suppression, safety rules, export/deletion (Phase 11)
  logging/         Structured JSON logger with redaction
tests/
  architecture/    Cross-package boundary tests (e.g. AI SDK import boundary)
  fixtures/        Shared test fixtures (golden AI-generation fixtures, etc.)
  integration/      Integration tests against isolated Postgres/Redis
  e2e/              Playwright end-to-end tests
docs/              Architecture, setup, and operational documentation
```
