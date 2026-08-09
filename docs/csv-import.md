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
3. **Name the list** — every import must be given a lead-list name
   (defaulted from the file name, editable). See "Named lead lists" below.
4. **Choose a duplicate strategy** — SKIP, UPDATE_BLANKS, OVERWRITE, REJECT,
   or ALLOW_SEPARATE (see `packages/leads/src/duplicates.ts`).
5. **Confirm** (`POST /api/organisations/:id/leads/import`) — resolves the
   list name to a `LeadList` (creating it if new), then creates an
   `ImportBatch` row referencing the same storage key (the file is never
   uploaded twice) and enqueues a BullMQ job. No parsing/writing happens on
   the request thread.
6. **Background processing** (`apps/worker/src/queues/lead-import.ts` →
   `packages/leads/src/import-batch.ts`) does the real work: normalize each
   field (deterministic — no AI), find-or-create the `Company` by domain,
   detect within-file and against-DB duplicates, apply the chosen strategy,
   upsert leads, and add every imported/updated lead to the batch's
   `LeadList`.
7. The wizard polls `GET /api/organisations/:id/leads/import/:batchId` for
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

## Named lead lists

`leadListName` is **required** by `POST /api/organisations/:id/leads/import`
— an import with no name is a `400`. The reason is downstream: a campaign
enrols a whole `LeadList` in one action
(`POST /campaigns/:id/enrollments` with `{ leadListId }`), so an unnamed
import is an audience that can only ever be re-selected by ticking prospects
one at a time.

- Reusing an existing name is allowed and **merges** into that list rather
  than erroring — re-importing a refreshed CSV of the same audience should
  extend the audience. The wizard warns when the name already exists.
- Membership is added for **updated** rows as well as newly created ones, so
  the list always describes the whole file, not just its new rows.
- `createMany({ skipDuplicates: true })` on the `(leadListId, leadId)` unique
  constraint keeps this idempotent under the batch-retry semantics below.
- Lists can also be created independently of an import:
  `POST /api/organisations/:id/lead-lists` takes either explicit `leadIds` or
  a `filter`, which is resolved server-side — that's "save this search as a
  list".

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

Three export shapes share that sanitizer and one column set:

| What                    | Request                                         |
| ----------------------- | ----------------------------------------------- |
| Every lead (all states) | `GET /leads/export`                             |
| The current view        | `GET /leads/export?search=&status=&leadListId=` |
| A tick-box selection    | `POST /leads/export` with `{ leadIds }`         |

The selection form is a POST because a selection can run to tens of
thousands of IDs, past any URL length limit. The filtered form goes through
`buildLeadWhere` — the same predicate builder the leads table itself lists
through — so "export what I'm looking at" provably matches what's on screen.

## Bulk actions and "select all matching"

`PATCH /api/organisations/:id/leads` takes an action (`archive`,
`unarchive`, `delete`) against **either** `{ leadIds }` (what's ticked) or
`{ filter }` (the table's "select all N matching" banner). The filter form
is resolved to IDs server-side by `listLeadIdsMatching` rather than trusting
a client-sent list, and every path stays scoped by `organisationId`.

`delete` is a hard delete via `deleteLeadsData`
(`packages/compliance/src/deletion-service.ts`): it relies on the schema's
cascades, so a deleted lead takes its enrollments, outbox items (including
sent-email history), conversations, meetings, and research with it. It is
chunked at 1000 IDs per statement and recorded as a single `DATA_DELETED`
audit event carrying the count and IDs.

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
