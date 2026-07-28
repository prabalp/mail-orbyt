# Controlled AI email generation

Phase 5 is the **only** place in the product where an AI model is called.
See [AI usage boundaries](ai-boundaries.md) for the full policy; this doc
covers the concrete architecture.

## The boundary, mechanically enforced

`packages/email-generation` is the only package in the monorepo permitted to
import `@google/genai` or read `AI_PROVIDER_API_KEY`. This is enforced by
`tests/architecture/ai-boundary.test.ts`, which scans every source file
outside that package for the SDK import, the key reference, or a deep import
of `@mail-orbyt/email-generation/src/client` (which would let another
package construct an AI call by hand). Even `apps/web`, which triggers
generation, never touches the API key or the Gemini client directly — it
only calls the package's public `generateEmail`/`rewriteEmail` functions and
checks `isAiConfigured()`.

`packages/email-generation/src/client.ts` is the single file where the SDK
is imported. Everything else in the package — prompt construction,
validation, retry logic — depends only on a small `AiEmailGenerator`
interface (`complete({ system, user }) => { subject, body }`), which is what
makes `generate.ts` fully unit-testable with a fake implementation, with no
network access or API key required.

## What the model is allowed to do

Per the product spec, AI generation is used for exactly these operations,
and nothing else:

- **INITIAL** — the first email in a sequence to a lead.
- **FOLLOW_UP** — references the prior email that got no reply.
- **CLOSE_THE_LOOP** — the final message in a sequence, briefly acknowledging
  no reply and leaving the door open.
- **Rewrites** — SHORTER / FORMAL / DIRECT variants of an existing draft,
  which must not introduce any new factual claim.

The model is never given: browsing/search access, the ability to invent
facts, scheduling logic, lead scoring, reply classification, or analytics.
All of those remain deterministic code elsewhere in the product.

## Inputs: snapshots, not live facts

Email generation reads from a `ResearchSnapshot` (`packages/research/src/snapshot.ts`),
not live `ResearchFact` rows. `createResearchSnapshot` copies only
`OBSERVED` and `USER_CONFIRMED` facts at generation time — `USER_REJECTED`,
`EXPIRED`, and `CONFLICTED` facts are excluded, since a conflicted fact's
value is disputed and shouldn't reach the model until a human resolves it.
Every `EmailDraft` row stores which snapshot it was generated from
(`researchSnapshotId`), so a draft's inputs stay reproducible even if the
underlying facts are later edited or the lead's research is rerun.

## Deterministic guardrails around the model

The model's output is never trusted blindly. Every generated email — from
the initial draft through every rewrite — passes through
`packages/email-generation/src/validator.ts` before it's returned to the
caller:

- No HTML/markdown markup (plain text only).
- No URL that isn't traceable to one of the facts it was given (blocks
  invented links).
- No email address (the model is never given one to reference, so any email
  address in the output is by definition invented).
- No phrase disclosing AI/research methodology ("based on my research",
  "as an AI", etc.) — the email must never reveal how it was produced.
- A hard word-count ceiling on the body.

If a generation attempt fails validation, `generate.ts` retries once with a
fresh call; if the second attempt also fails, it throws
`GeneratedEmailValidationError` rather than ever returning or persisting the
invalid draft. A network/auth/rate-limit failure from the provider itself is
wrapped in `AiGenerationFailedError` so `apps/web` can show a friendly
message instead of a raw 500.

## Optional, like the Phase 4 research providers

`AI_PROVIDER_API_KEY` is optional in `packages/config`'s env schema, exactly
like the Phase 4 search/news/enrichment provider keys. `isAiConfigured()`
reports whether a key is set; `apps/web`'s `EmailDraftPanel` shows a plain
"AI email generation is not configured" message instead of a generate button
when it isn't, rather than crashing or silently no-opping.

## Verification

- **Unit tests** (`packages/email-generation`, 24 tests): prompt construction
  per generation type, every validator rule, retry-on-validation-failure
  behavior, and the Gemini client wrapper — mocked at the SDK boundary
  (`vi.mock("@google/genai")`), since making real, billed model calls
  from an automated test run isn't appropriate. This mirrors how Phase 4's
  optional third-party search/news/enrichment providers were tested.
- **Integration test** (`tests/integration/research-snapshot.test.ts`, 2
  tests): `createResearchSnapshot` against real Postgres, confirming
  rejected/expired/conflicted facts are excluded and the snapshot is
  correctly scoped and persisted.
- **Live verification against the running dev server**: with no
  `AI_PROVIDER_API_KEY` set, `GET .../email-drafts` correctly reports
  `aiConfigured: false` and `POST .../email-drafts` correctly returns `503`
  with `AiNotConfiguredError`'s message, rather than a fake success. With an
  invalid (unreachable) key set, the same endpoint returns a friendly `502`
  via `AiGenerationFailedError` instead of leaking a raw exception. Manual
  end-to-end generation against a real Gemini API key was not run in this
  environment (no billed key configured here) — this is the one manual
  verification step a real deployment must perform before relying on this
  feature.
