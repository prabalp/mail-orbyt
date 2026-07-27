# Meetings, attribution, and analytics

Phase 10 adds manual meeting logging and the product's primary success
metric.

## The primary metric is qualified meeting rate — not open rate

Per the product spec: **qualified meeting rate = qualified meetings booked
/ unique prospects contacted.** `packages/analytics/src/metrics-service.ts`
computes exactly this and nothing else is ever presented as the headline
number. There is no email-open tracking anywhere in the product — no
tracking pixel, no open-rate field — since open rate is explicitly _not_
the metric the product optimizes for, and open tracking has its own
deliverability and privacy costs that aren't worth taking on for a vanity
metric.

- **Denominator — unique prospects contacted**: distinct leads with at
  least one `OutboxItem` in status `SENT` (never `SCHEDULED` — a queued
  send that hasn't gone out yet doesn't count as contacted).
- **Numerator — qualified meetings booked**: `Meeting` rows with
  `qualified: true` and `status` not `CANCELLED`. `qualified` is always a
  human judgment call, set by a person reviewing the meeting — never
  inferred automatically from a reply classification or anything else.
- **Rate is `null`, not `0`, when nobody has been contacted yet** — an
  undefined rate is different from a zero rate, and conflating them would
  make an org with no activity look identical to one with 100 contacts and
  0 meetings.

Reply rate is computed too (`getReplyRate`) but is explicitly labeled
"context only" in both the code and the UI — it exists to help diagnose
_why_ the primary metric is what it is, not to compete with it.

## Meetings are logged manually

There's no calendar integration in this product (no Google Calendar OAuth
was added) — a `Meeting` is a manual record a human creates, typically from
the Conversations page once a reply turns into a booked call. `campaignId`
is captured at booking time for attribution, since a lead's campaign
enrollments can change or complete after the meeting is logged.

## Verification

- **Unit tests** (`packages/analytics`, 12 tests): meeting creation/update
  org-scoping, and every metrics computation (contacted-count, booked-count
  excluding cancelled, the rate formula including the null-not-zero case,
  reply rate including its null case, and per-campaign breakdown) — all
  against a fake Prisma client.
- **Integration test** (`tests/integration/metrics.test.ts`, 2 tests): the
  full rate calculation against real Postgres with 4 leads — 3 actually
  sent to (contacted) and 1 only scheduled (must not count), and 3
  meetings — one genuinely qualified, one left unqualified, and one
  qualified-but-cancelled (neither of the latter two may count) — asserting
  the exact expected `3` contacted / `1` qualified / `1/3` rate. A second
  test confirms a fresh organisation with zero activity gets a `null` rate.
- **Live verification** against the running dev server: `GET
.../analytics` correctly returns `rate: null` for an organisation with no
  activity (not `0`), and after manually creating and qualifying a meeting
  for a lead who was never actually sent a campaign email, the rate
  correctly stayed `null` (a qualified meeting doesn't fabricate a
  denominator) while `qualifiedMeetingsBooked` correctly incremented to 1 —
  confirming the metric only ever divides by real, sent-to prospects.
