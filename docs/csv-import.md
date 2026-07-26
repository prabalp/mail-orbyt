# CSV lead import

## Flow

1. **Upload** (`POST /api/organisations/:id/leads/import/preview`) — the CSV
   is uploaded to object storage immediately (a temp key under
   `imports/<organisationId>/<uuid>.csv`) and parsed for a preview: headers,
   a suggested column mapping, total row count, and the first 20 rows with
   validation errors. Nothing is written to the database yet.
2. **Map & review** — the user confirms/adjusts the column mapping in the
   wizard (`apps/web/src/app/(app)/leads/import/page.tsx`) against the same
   preview data.
3. **Choose a duplicate strategy** — SKIP, UPDATE_BLANKS, OVERWRITE, REJECT,
   or ALLOW_SEPARATE (see `packages/leads/src/duplicates.ts`).
4. **Confirm** (`POST /api/organisations/:id/leads/import`) — creates an
   `ImportBatch` row referencing the same storage key (the file is never
   uploaded twice) and enqueues a BullMQ job. No parsing/writing happens on
   the request thread.
5. **Background processing** (`apps/worker/src/queues/lead-import.ts` →
   `packages/leads/src/import-batch.ts`) does the real work: normalize each
   field (deterministic — no AI), find-or-create the `Company` by domain,
   detect within-file and against-DB duplicates, apply the chosen strategy,
   and upsert leads.
6. The wizard polls `GET /api/organisations/:id/leads/import/:batchId` for
   status until `COMPLETED` or `FAILED`.

## Idempotency

The job is safe to run more than once for the same batch (queue
redelivery, worker crash mid-run, BullMQ retry). Each CSV row is
checkpointed via its `ImportRow` (unique on `(importBatchId, rowNumber)`):
a row already in a terminal status, or already linked to a lead, is skipped
on retry rather than reprocessed — so a partial rerun can never create a
duplicate lead. `enqueueImportJob` also gives every job a stable `jobId`
derived from the batch ID, so enqueuing the same batch twice (a double
click, a retried request) reuses the same BullMQ job instead of running the
import concurrently.

## Normalization (deterministic, no AI)

`packages/leads/src/normalize.ts`: email lowercasing, name title-casing,
whitespace collapsing, URL scheme/host normalization, domain extraction,
and a small country-alias table (USA → United States, etc.). None of this
touches the AI provider — see `docs/ai-boundaries.md`.

## Duplicate detection

Two layers, both pure/testable independently of the database
(`packages/leads/src/duplicates.ts`):

- **Within-file**: rows sharing the same normalized email in one CSV are
  flagged after the first occurrence (`findWithinBatchDuplicates`).
- **Against existing data**: an existing `Lead` with the same
  `(organisationId, email)` triggers `decideDuplicateAction`, which maps the
  chosen `DuplicateStrategy` to SKIP / UPDATE_BLANKS / OVERWRITE / REJECT /
  CREATE_SEPARATE.

## CSV export and formula injection

`packages/leads/src/csv-export.ts`'s `sanitizeCsvField` prefixes any field
starting with `=`, `+`, `-`, `@`, tab, or CR with a single quote before
writing it to the export CSV — the standard mitigation for spreadsheet
formula injection ("CSV injection"), where a malicious lead record (e.g. a
company name of `=cmd|'/c calc'!A1`) would otherwise execute as a formula
when the export is opened in Excel/Sheets.

## Suppression foundation

`packages/leads/src/suppression.ts` provides `isSuppressed` (checked by
email and by the sender's domain) and `addSuppressionEntry`, backed by the
`SuppressionEntry` table. This phase only establishes the data model and
check function — the full safety-rule engine (bounce/unsubscribe-triggered
suppression, per-campaign suppression, etc.) is built in Phase 11. Every
future send path must call `isSuppressed` rather than querying
`SuppressionEntry` directly.

## Object storage

`packages/storage` wraps the AWS S3 SDK behind an `ObjectStorage` interface
(`putObject`/`getObject`/`deleteObject`) so nothing outside that package
depends on `@aws-sdk/client-s3` directly. `S3ObjectStorage` talks to MinIO
locally (via `STORAGE_*` env vars) and any S3-compatible bucket in
production; `InMemoryObjectStorage` is used in tests.

**Local setup**: MinIO does not auto-create buckets. After
`docker compose up -d`, create the bucket once (there's no bundled CLI for
this yet — use the MinIO console at http://localhost:9001, or the AWS SDK's
`CreateBucketCommand` against the `STORAGE_BUCKET` value in `.env.example`).

## Known gotchas hit while building this phase

- **BullMQ job IDs cannot contain `:`.** `enqueueImportJob`'s original
  `jobId` (`import-batch:<id>`) threw at enqueue time against a real Redis
  — caught only by actually enqueuing a job, not by any mocked test. Fixed
  to use `import-batch-<id>`.
- **Merging must operate on the Lead's own scalar fields, not the full
  Prisma row.** An early version of the UPDATE_BLANKS/OVERWRITE merge spread
  the entire `existingLead` object (id, timestamps, `companyId`,
  `fieldSources` JSON) into the update payload — Prisma rejected it, and it
  would have silently double-written `companyId`. Fixed by extracting only
  the `LeadScalarFields` subset before merging.
- **`/onboarding` cannot live inside the `(app)` route group** (see
  `docs/authentication.md`) — relevant again here because the CSV import
  wizard assumes a resolved organisation via `useOrganisation()`, which only
  exists once that redirect loop is avoided.
