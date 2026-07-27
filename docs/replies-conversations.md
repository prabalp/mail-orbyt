# Replies, follow-ups, conversations, and retargeting

Phase 9 detects replies to sent campaign emails, stops automation the
instant a lead responds, and surfaces both replies and re-targetable
non-responders.

## Reply classification is deterministic, not AI

The product spec explicitly lists reply classification as a forbidden AI
use case (see [AI usage boundaries](ai-boundaries.md)). `packages/conversations`
never imports an AI SDK — `reply-classifier.ts` is pure keyword matching
against a fixed set of phrase lists (`UNSUBSCRIBE_REQUEST`,
`OUT_OF_OFFICE`, `BOUNCE`, `NOT_INTERESTED`, `INTERESTED`). When nothing
confidently matches, the result is `UNCLASSIFIED` rather than a guess — a
human reviews those in the Conversations UI. This matters most for
`INTERESTED`, since that classification eventually feeds the qualified
meeting rate metric (Phase 10) and a false positive there would inflate
the product's core success metric.

## A reply always stops automation, regardless of classification

This is the load-bearing safety rule of this phase.
`reply-sync-service.ts`'s `syncRepliesForOutboxItem` exits the
`CampaignEnrollment` (`status: EXITED`, `exitReason: "Lead replied"`) the
moment _any_ genuine reply is found in a sent message's Gmail thread — not
only when it's classified as `NOT_INTERESTED` or `UNSUBSCRIBE_REQUEST`.
Even an `INTERESTED` or `UNCLASSIFIED` reply stops the sequence, because
once a human has entered the conversation, automation must never keep
emailing on top of them.

## How reply detection works

Every Gmail send (Phase 8) now captures the message's `threadId` alongside
its `messageId` (`OutboxItem.providerThreadId`). The worker's existing
60-second scheduler tick (Phase 8) also calls `syncRecentReplies`, which:

1. Finds every `SENT` `OutboxItem` from the last 14 days whose enrollment
   is still `ACTIVE`.
2. Fetches the full Gmail thread (`gmail.readonly` scope, already
   requested in Phase 6's OAuth consent) via `fetchThreadMessages`.
3. Filters out messages `From` the connected inbox itself — anything left
   is a genuine reply.
4. Upserts a `Conversation` (keyed on organisation+lead+inbox — one thread
   per lead per mailbox, not per campaign, since a reply pauses every
   campaign that lead is in) and a `ConversationMessage` per new reply,
   deduped on `(conversationId, gmailMessageId)` so re-syncing the same
   thread never double-records a reply or re-exits an already-exited
   enrollment.

No separate queue was introduced for this — it rides the same tick as
outbox scheduling, since both are lightweight periodic passes over a small
working set.

## Retargeting

`listRetargetableLeads` finds leads whose most recent enrollment
`COMPLETED` (finished a full sequence with no reply) and who aren't
currently `PENDING`/`ACTIVE` in any other campaign — the natural pool of
non-responders worth trying again in a new campaign. A lead who replied is
never in this pool: their enrollment exits as `EXITED`, not `COMPLETED`.
Suppression is re-checked at actual enrollment time (Phase 7's
`enrollLeads`), not duplicated here.

## What this phase does NOT do

There is no manual reply-composer in the app — Phase 9 is about
detection, classification, auto-pause, and visibility, not about
sending replies from within Mail Orbyt. A human who wants to reply does so
directly in Gmail. The Conversations UI only shows inbound messages
(the outbound side of a thread already lives on the corresponding
`OutboxItem` from Phase 8) — a fully merged bidirectional thread view was
left out of scope for this phase.

## Verification

- **Unit tests** (`packages/conversations`, 17 tests): every classifier
  rule plus the "don't guess" default, reply-sync's no-reply/genuine-reply/
  already-recorded-reply paths (mocked Gmail thread fetch and Prisma),
  conversation listing/detail org-scoping, and retargeting pool
  computation (excluding active-elsewhere and already-in-target leads).
- **Integration test** (`tests/integration/reply-sync.test.ts`, 1 test):
  a real campaign/inbox/enrollment/sent-`OutboxItem` against real
  Postgres, with a fake Gmail thread fetch (no real Gmail account exists
  in this environment) — proves a reply is recorded, classified, exits the
  enrollment, and that reprocessing the same thread doesn't duplicate the
  message or re-exit.
- **Live verification** against the running dev server: `GET
.../conversations` correctly returns an empty list for the seeded
  organisation, and a VIEWER-role user is correctly blocked (`403`) —
  `conversations:review` is required, matching the existing role matrix
  from Phase 2.

## Limitation

No real Gmail thread was fetched in this environment (no real Google
Workspace account/OAuth credential exists here) — `fetchThreadMessages`
itself is covered only by `packages/gmail`'s existing OAuth/token-refresh
test coverage from Phase 6, not by a real network round trip. A real
deployment's first manual QA pass should send a real campaign email, reply
to it from another mailbox, and confirm the reply appears in Conversations
and the enrollment exits.
