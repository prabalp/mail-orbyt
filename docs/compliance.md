# Safety, compliance, export/deletion/retention

Phase 11 closes the compliance gaps left implicit in earlier phases: an
unsubscribe reply must actually stop future contact everywhere (not just
pause one campaign), a data subject can get everything the product holds
about them, erasure must be complete, and stale data doesn't accumulate
forever.

## Unsubscribe requests now auto-suppress

This is the most important fix in this phase. Phase 9 built reply
classification and made _any_ reply exit the triggering enrollment — but
an `UNSUBSCRIBE_REQUEST` classification wasn't, until now, wired into the
actual suppression list. That gap meant a lead who explicitly asked to be
removed would stop hearing from _that_ campaign but could still be
enrolled into a _different_ campaign later — a real compliance failure,
not just a UX rough edge.

`packages/conversations/src/reply-sync-service.ts` now calls
`packages/leads`' `addSuppressionEntry` (the same canonical suppression
list every send path already checks) the moment a reply classifies as
`UNSUBSCRIBE_REQUEST`, with `reason: "UNSUBSCRIBE"`. This is
proven end-to-end in `tests/integration/compliance.test.ts` — a real reply
against real Postgres, checked with the same `isSuppressed` function every
other part of the product uses, both before and after the reply lands.

The suppression list itself had a service layer and no HTTP surface at
all — everything that could suppress an address had no way to list, remove,
or check one. `GET/POST/DELETE /api/organisations/:id/suppressions` (see
`packages/leads/src/suppression.ts`'s `listSuppressionEntries`,
`removeSuppressionEntry`, `checkSuppression`) closes that, and is exposed as
four MCP tools (`list_suppressions`, `check_suppression`, `add_suppression`,
`remove_suppression` — see `docs/mcp-server.md`). Removing an entry is
audited as `SUPPRESSION_REMOVED`; it should never be done for an
`UNSUBSCRIBE` entry without explicit human instruction, since un-suppressing
someone who opted out is a compliance breach, not a preference.

## Right to access — `exportLeadData`

`packages/compliance/src/export-service.ts` bundles everything the product
holds about one lead into a single JSON object: the lead record, research
facts, email drafts, campaign enrollments, conversations (with messages),
and meetings. Every export is itself recorded as a `DATA_EXPORTED` audit
event — access requests need their own trail. Exposed via
`GET /api/organisations/:id/leads/:leadId/export`, requiring
`leads:manage`, and a "Export data" button in the lead detail drawer that
downloads the bundle as a `.json` file.

## Right to erasure — `deleteLeadData`

`packages/compliance/src/deletion-service.ts` deletes the `Lead` row and
relies entirely on the schema's own cascade-delete foreign keys — every
child table (`ResearchFact`, `EmailDraft`, `CampaignEnrollment`,
`OutboxItem`, `Conversation`, `Meeting`) has `onDelete: Cascade` on its
`leadId` relation. This is a deliberate design choice: there is exactly one
place a future model addition could forget to cascade correctly (the
schema itself), rather than this function needing to remember every table
by hand and drift out of sync as new lead-linked models get added. A
`DATA_DELETED` audit event is recorded separately from the lead's own data,
since the record of an erasure needs to survive the erasure.
`DELETE /api/organisations/:id/leads/:leadId` requires `leads:manage`, with
a confirmation dialog and "Delete lead data" button in the drawer.

## Retention — `purgeStaleData`

Deliberately narrow. What's purged:

- `DISCARDED` `EmailDraft` rows past the retention window — a rejected AI
  draft serves no purpose once discarded.
- `ImportRow` rows past the retention window — raw per-row CSV data
  (whatever the original uploaded file contained) has already been
  normalized into `Lead` rows; there's no reason to keep the raw import
  data indefinitely.

What's **never** purged here: `SuppressionEntry` (a "do not contact" record
must persist indefinitely — losing one and re-emailing an opted-out
contact is exactly the failure this phase exists to prevent), sent
`OutboxItem`s, and `Meeting`s (both are business/audit record, not
transient data). Exposed via
`POST /api/organisations/:id/compliance/retention-purge`, gated behind
`organisation:delete` (OWNER-only) since it's a destructive bulk-delete
action.

## Emergency stop (already built in Phase 8)

`EMERGENCY_STOP` remains the global kill switch checked before every send
in `processOutboxItem`. No organisation-level or per-campaign kill switch
was added in this phase — pausing a specific campaign already works via
`Campaign.status = PAUSED` (Phase 7), and the global flag covers the
"stop everything, right now" case.

## Verification

- **Unit tests**: `packages/compliance` (7 tests) — export/deletion
  org-scoping and audit-event recording, retention purge scoping and
  cutoff-date math, all against a fake Prisma client. `packages/conversations`
  gained one new test asserting `addSuppressionEntry` is called with the
  right reason when a reply classifies as `UNSUBSCRIBE_REQUEST`.
- **Integration tests** (`tests/integration/compliance.test.ts`, 4 tests)
  against real Postgres: an unsubscribe reply actually flips
  `isSuppressed` from `false` to `true` for the lead's real email;
  erasure cascade-deletes a lead's `ResearchFact` row and records the
  audit event; export returns a real bundle; retention purge deletes an
  old `DISCARDED` draft while leaving a recent, non-discarded one intact.
- **Live verification** against the running dev server: exported a real
  lead's data bundle, ran a retention purge, deleted a real lead via the
  API and confirmed a subsequent `GET` correctly 404s, confirmed the
  `DATA_EXPORTED`/`DATA_DELETED` audit events were actually written, and
  confirmed a VIEWER-role user is correctly blocked (`403`) from both
  lead erasure (`leads:manage` required) and retention purge
  (`organisation:delete`, OWNER-only).
