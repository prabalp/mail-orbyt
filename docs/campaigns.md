# Campaign and sequence builder

Phase 7 builds the campaign/sequence data model and the UI to define one —
creating a campaign, adding sequence steps, assigning a sending inbox pool,
and enrolling leads. **No sending happens in this phase**: `Campaign.status`
can be set to `ACTIVE`, but nothing consumes that yet — Phase 8's
scheduler/outbox is what will actually pick up enrollments and send.

## Data model

- **Campaign** — name, status, timezone, and a sending window
  (`sendingDaysOfWeek`, `sendingWindowStartMinute/EndMinute` in minutes since
  midnight, in the campaign's own timezone), plus `inboxCooldownMinutes` —
  the minimum gap between two sends from the same inbox. Phase 8's scheduler
  owns converting all of these into actual send times; see
  docs/scheduling-sending.md for how the per-inbox throttle is enforced.
  `emailPromptInstructions` holds the campaign's own prompt — see "The
  campaign prompt" below.
- **CampaignStep** — one step in the sequence, ordered by `orderIndex`
  (kept contiguous — see below), typed `INITIAL`/`FOLLOW_UP`/
  `CLOSE_THE_LOOP`, with `delayDays` since the previous step. Each step is
  either AI-generated (`useAiGeneration: true`, using Phase 5's
  `generateEmail` with an optional `callToActionOverride`) or a manually
  written template (`manualSubject`/`manualBody`) — never both;
  `assertValidContent` in `step-service.ts` enforces a manual step always
  has both fields.
- **CampaignInbox** — the rotation pool of sending inboxes for a campaign
  (many-to-many with `Inbox`). `setCampaignInboxes` validates every inbox
  belongs to the organisation and is `CONNECTED` before it can join a pool —
  a disconnected or mid-reauth inbox can't silently end up in rotation.
- **CampaignEnrollment** — a lead's participation. Enrolling a lead that's
  already suppressed (`packages/leads`' `isSuppressed`) enrolls them with
  status `SUPPRESSED` rather than silently skipping them, so it's visible in
  the UI _why_ a contact isn't being reached, not just absent from the list.

## Enrolling leads

Two paths, both landing in `enrollLeads`:

- **A whole lead list** — `POST /campaigns/:id/enrollments` with
  `{ leadListId }`. Every CSV import names its list (docs/csv-import.md), so
  this is the normal way to put an audience into a campaign. The membership
  query is scoped by the list's `organisationId` as well as the campaign's,
  so a cross-tenant list ID is an error rather than a silent "0 enrolled".
- **Individually** — `{ leadIds }`, from the search box in the campaign's
  Enrollments card, for one-off additions.

## The campaign prompt

`Campaign.emailPromptInstructions` is the campaign's own prompt: which
recipient data its emails may use, how they should be formatted, and the
voice to write in. Generating an email runs exactly two prompts — generation,
then a QA review pass — and this is the editable half of both.

- **It replaces the organisation-level `emailPromptInstructions`** from
  Settings rather than stacking with it. Two sets of data/format/voice
  guidance in one prompt contradict each other as often as they compose, and
  a campaign's output should be readable in one place.
- Empty (or whitespace-only) falls back to the organisation default, which is
  what the "Clear and use organisation default" button writes. If that is
  empty too, `buildGenerateEmailPrompt` falls back to
  `DEFAULT_CAMPAIGN_EMAIL_PROMPT` — the single fallback in the chain, and the
  text the campaign editor seeds itself with, so what generates is what the
  editor shows.
- It rides in the **user** message (`campaignPrompt`), never the system
  prompt. The system prompt holds only the safety rules — facts-only
  personalisation, no invented claims, no fabricated URLs, no self-written
  signature — which always take priority and cannot be relaxed from here.
  See docs/ai-boundaries.md.
- The **QA pass sees it too**, as the specification to check the draft
  against, so a campaign asking for one-line emails is not "corrected" back
  into a house style.
- Both send paths honour it: `processOutboxItem`
  (`packages/scheduling/src/outbox-service.ts`) for real sends and
  `sendTestEmail` (`apps/web/src/lib/campaigns.ts`), so a test send previews
  the campaign's real output.

## Guardrails

- **Activation requires a real campaign.** `updateCampaign` rejects setting
  `status: "ACTIVE"` unless the campaign has at least one step and at least
  one inbox in its pool (`CampaignActivationError`, surfaced as a `409`).
- **Step order stays contiguous.** Removing a step renumbers the remaining
  ones to `0..n-1`; reordering requires the exact existing step-id set
  (`InvalidStepError` otherwise) — there's no path to a gap or a duplicate
  `orderIndex`.
- **Enrollment always re-uses the canonical suppression check** —
  `packages/leads`' `isSuppressed`, the same function every other send-path
  in the product uses, so there's exactly one place suppression logic lives.

## Verification

- **Unit tests** (`packages/campaigns`, 24 tests): campaign
  create/update/archive/activation-guardrail, step add/update/remove/
  reorder (including the contiguous-renumbering and exact-id-set checks),
  inbox pool validation (ownership + CONNECTED status), and enrollment
  (suppressed vs. normal vs. already-enrolled) — all against a fake Prisma.
- **Integration test** (`tests/integration/campaign-enrollment.test.ts`, 2
  tests): enrollment against real Postgres with a real `SuppressionEntry`
  row, confirming a suppressed lead is enrolled as `SUPPRESSED` (not
  dropped) and that re-enrolling an already-enrolled lead doesn't duplicate
  the row.
- **Live verification against the running dev server**: created a real
  campaign, added INITIAL and FOLLOW_UP steps, confirmed activation is
  correctly rejected (`409`) with no inbox pool, enrolled a real lead and
  confirmed it landed as `PENDING`, and confirmed permission enforcement —
  MEMBER can create campaigns (`campaigns:manage` is granted to MEMBER,
  matching Phase 2's role matrix) while VIEWER is correctly blocked (`403`).
