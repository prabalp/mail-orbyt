# Scheduler, inbox rotation, outbox, and sending

Phase 8 is where a Phase 7 campaign actually starts sending. Two BullMQ
queues drive it:

- **`campaign-scheduler`** — one repeatable "tick" job every 60s. Calls
  `enqueueDueOutboxItems`, which ensures every ACTIVE campaign's
  PENDING/ACTIVE enrollments have their current step's `OutboxItem` row
  created (idempotently — see below), then finds any `OutboxItem`s due
  within the next 60s and enqueues a BullMQ job for each via
  `enqueueOutboxItem`.
- **`outbox`** — processes one `OutboxItem` per job by calling
  `processOutboxItem`, which does the actual send.

## The outbox pattern and idempotency

`OutboxItem` has a unique constraint on `(campaignId, leadId,
campaignStepId)` — this is the entire idempotency guarantee. No matter how
many times the scheduler tick runs, or how many times a BullMQ job for the
same item is retried, there is exactly one row for a given lead's given
step, and `processOutboxItem` treats any item not in `SCHEDULED` status as
a no-op (already sent, already terminally failed, already skipped). BullMQ
job IDs are also derived from the item's own ID
(`outbox-item-${outboxItemId}`), so re-enqueuing the same item is a BullMQ
no-op too — two independent layers both preventing a double-send.

Content (subject/body) is materialized once, the first time an item is
processed, and stored on the row — a retry after a transient send failure
resends the exact same text rather than generating new AI copy.

## Timezone-aware sending windows

`packages/scheduling/src/sending-window.ts` computes a campaign's
day-of-week and minutes-since-midnight _as observed in the campaign's own
IANA timezone_, using `Intl.DateTimeFormat` (no external date library
needed — the tz database is already in Node/V8). `nextSendableTime` jumps
day-by-day to find the next moment inside the configured
`sendingDaysOfWeek`/window; the day-jump is an approximate +24h (can be off
by an hour across a DST transition), which is an accepted simplification at
day/hour scheduling granularity.

## Inbox rotation

`pickNextInbox` picks the CONNECTED inbox in a campaign's pool with the
fewest sends today (UTC day boundary — a documented simplification, since
per-inbox-owner local time isn't tracked) among those under their
`dailySendLimit`. Always picking the least-used inbox naturally produces
round-robin rotation without a separate cursor. If every inbox in the pool
is disconnected or at its daily limit, the item is deferred (rescheduled
+1h) rather than forced through an over-limit inbox.

## Per-inbox send cooldown

Without a throttle, a tick that finds 200 due items hands them all to the
outbox workers at once and one mailbox emits 200 emails in under a minute —
the single clearest spam signal a provider can see. `Campaign.inboxCooldownMinutes`
(default 3, configurable per campaign alongside the sending window, `0`
disables it) is the minimum gap between two sends **from the same inbox**.
It is deliberately per inbox and not per campaign: with three inboxes in the
pool and a 3-minute cooldown, three emails still go out at the same instant
— one from each — they just can't each go twice. Throughput scales with the
number of mailboxes, which is also how the reputation risk actually scales.

The state lives on `Inbox.sendCooldownUntil` rather than being derived from
the last `OutboxItem.sentAt`, for two reasons:

- **It's a property of the mailbox, not the campaign.** An inbox shared by
  two campaigns is still one mailbox, and one campaign's cooldown must block
  the other's sends from it.
- **It makes the claim atomic.** `pickNextInbox` doesn't read-then-check; it
  _claims_ the slot with a conditional `UPDATE ... WHERE id = ? AND
(sendCooldownUntil IS NULL OR sendCooldownUntil <= now)` and only uses the
  inbox if that update matched a row. With four concurrent outbox workers
  (and multiple worker processes), a read-then-check would let all four
  through the same open window; a compare-and-set in Postgres produces
  exactly one winner and the losers move on to the next inbox in the pool.

The claim is written at PICK time, then re-anchored to the actual send time
by `markInboxSent` once the provider accepts the message — otherwise slow AI
generation or a slow Gmail call would be spent from inside the inbox's own
cooldown, making the real gap between two emails shorter than configured. A
send that fails keeps its claim: a failure may still have reached the
provider, and the 5-minute retry backoff outlasts a typical cooldown anyway.

An item blocked only by a cooldown isn't retried blindly — `pickNextInbox`
returns `availableAt` (the earliest moment any under-limit inbox frees up)
and the item is rescheduled for exactly then, run back through
`nextSendableTime` in case the wait pushes it past the end of the day's
window. That's distinct from the +1h deferral, which is for a pool with
nothing sendable in it at all (empty, all disconnected, or all at their
daily limit) and therefore no known "available at" moment.

## Safety checks re-run at send time

Two checks that matter most are re-verified in `processOutboxItem` itself,
not just trusted from enrollment time, since either can change in the
window between scheduling and actual send:

- **Suppression** — `packages/leads`' `isSuppressed`, the same canonical
  check used everywhere else. A newly-suppressed lead is caught here even
  if they weren't suppressed when originally enrolled; the item is marked
  `SKIPPED_SUPPRESSED` and the enrollment exits.
- **Emergency stop** — `EMERGENCY_STOP` is checked before every send. If
  active, the item is left untouched in `SCHEDULED` — no error, no
  progress, just paused, so flipping the flag off resumes exactly where it
  left off.

## Retry and failure

A send failure (network error, Gmail API error) increments `attempts` and
retries (stays `SCHEDULED`, rescheduled 5 minutes out) until
`MAX_ATTEMPTS` (3), after which the item is marked `FAILED` — terminal, not
retried further, and visible for a human to investigate.

## A real bug found via live verification

**`EMERGENCY_STOP=false` in `.env` was silently engaging the kill switch.**
`packages/config`'s env schema originally used `z.coerce.boolean()`, which
runs the JS `Boolean()` constructor on the raw string — and
`Boolean("false")` is `true` (only the _empty_ string is falsy). Every
outbox item processed while the worker was running with the literal env
line `EMERGENCY_STOP=false` (the natural, obviously-correct way to write
"not stopped") was silently left in `SCHEDULED` forever, with the worker
logging a normal "processed" completion and no error at all — a completely
silent failure to ever send anything.

This was caught by watching a real worker process a real seeded
campaign/inbox/enrollment end to end: the item stayed `SCHEDULED` with
`attempts: 0` and no `lastError`, which doesn't match any of
`processOutboxItem`'s legitimate early-return branches except the
emergency-stop one. Fixed by replacing `z.coerce.boolean()` with a
`booleanEnvVar()` helper that parses the literal strings
`"true"`/`"1"`/`"false"`/`"0"` instead of relying on JS truthiness, for both
`EMERGENCY_STOP` and `STORAGE_FORCE_PATH_STYLE` (which happened to share
the same bug — silently masked there only because its default, `true`,
happens to match `Boolean("true")`). Regression tests added in
`packages/config/src/env.test.ts` assert `"false"` parses to `false` for
both flags.

After the fix, re-running the same live scenario showed the pipeline
working correctly end-to-end: the scheduler found the due enrollment,
created its `OutboxItem`, the outbox worker materialized the manual step's
content with `{{firstName}}` merge-token substitution applied correctly,
picked the pool's only CONNECTED inbox, and attempted a real Gmail API
token refresh call — which correctly failed with a real `401` (the seeded
inbox has a fake, non-real Google refresh token) and was recorded as a
retryable attempt, exactly the expected behavior for an invalid credential.

## Verification

- **Unit tests**: `packages/scheduling` (42 tests) — sending-window
  timezone/DST math against real `Intl` behavior, inbox rotation
  round-robin and limit enforcement, the per-inbox cooldown (slot claimed on
  pick, disabled at `0`, a cooling inbox skipped in favor of a free one,
  losing a claim race falling through to the next inbox, and never
  rescheduling into the past), enrollment progression (idempotent
  scheduling, completion when no next step), content materialization
  (merge tokens, AI-not-configured error), and the full
  `processOutboxItem` state machine (no-op on non-SCHEDULED, emergency
  stop, suppression, no-inbox deferral, success, retry, terminal failure).
  `packages/gmail`'s `send-email.test.ts` (2 tests) covers the Gmail send
  API call and RFC 2822/base64url encoding, mocked at the `fetch` boundary.
  `packages/config`'s regression tests for the boolean-coercion bug.
- **Integration tests** (`tests/integration/outbox.test.ts`, 3 tests): the
  full pipeline — campaign, steps, inbox, enrollment — against real
  Postgres, proving a two-step manual sequence sends both steps in order,
  advances and completes the enrollment, and that reprocessing the same
  `OutboxItem` never double-sends. The third test enrolls three leads
  against a two-inbox pool with a 3-minute cooldown and asserts the shape
  the throttle is supposed to have: exactly two sends, one per inbox, with
  the third item deferred to a future `scheduledFor` and no inbox
  assigned.
- **Live verification** with a real running worker process against real
  Postgres/Redis: seeded a real campaign/inbox/enrollment, watched the
  scheduler tick pick it up and the outbox worker process it — first
  catching the `EMERGENCY_STOP` bug above, then confirming the fixed
  pipeline correctly materializes content, rotates to the connected inbox,
  and attempts a real (correctly-failing, since the credential is fake)
  Gmail API call.

## Limitation

No real Gmail send was completed in this environment (no real, billed
Google Workspace account/OAuth credential exists here) — the send call
itself is verified only up to a real, correctly-handled `401` from Google's
token endpoint. A real deployment's first manual QA pass should run one
real campaign end-to-end with a genuinely connected Gmail inbox.
