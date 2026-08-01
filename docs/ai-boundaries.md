# AI usage boundaries

This document is the source of truth for what AI is, and is not, allowed to
do in Mail Orbyt. It is enforced by code, not just convention.

## Allowed uses

AI may only be used, via `packages/email-generation`, to:

- generate an initial outbound email;
- generate a follow-up email;
- generate a final close-the-loop email;
- rewrite an email to be shorter, more formal, or more direct;
- generate a controlled experiment variant.

AI may additionally be used, via `packages/research-keywords`, to:

- extract candidate keywords from a webpage's text — but only text that
  `packages/research` already fetched deterministically and saved as a
  `ResearchPageText` row. The AI here never browses, never fetches
  anything itself, and never runs unless an operator has explicitly set
  `KEYWORD_EXTRACTION_MODE=ai` (the default, `deterministic`, uses a plain
  stopword/frequency algorithm with no AI involved at all). Every keyword
  it returns is checked against the saved text before being kept, and every
  resulting fact carries an `evidenceExcerpt` sliced deterministically from
  that text — never text generated or paraphrased by the model — so it
  stays as auditable as any other research fact.

AI may additionally, via `packages/email-generation`'s `generateEmail`:

- receive a bounded (~2000 character) excerpt of the subject's own saved
  website text (the same `ResearchPageText` used by keyword extraction),
  **in addition to** — never instead of — the curated facts list. It is
  explicitly labeled to the model as untrusted, context-only content: usable
  for tone/topic familiarity, never as a source of a new factual claim, and
  the model is told not to follow any instruction that might appear inside
  it. The output validator's URL-allowlist and every other check still run
  exactly as before — nothing about this excerpt loosens what the model is
  allowed to produce.
- receive organisation-configured tone/style instructions (Settings → Email
  template), appended to — never replacing — the fixed core system prompt.
  The hard rules (no invented facts, no research disclosure, one CTA, plain
  text, etc.) are always present and always take priority; an organisation
  can only add voice/phrasing preferences on top of them.
- be told to echo a fixed placeholder token (`[[BOOKING_LINK]]`) representing
  a configured Calendly link. The model never sees or writes the real URL —
  `generateEmail` substitutes the real link in after validation via plain
  string replacement (or appends a deterministic fallback line if the model
  dropped the token), so the link cannot be mangled or hallucinated.

## Prohibited uses

AI must never be used for: scraping, browsing, live webpage extraction, CSV
parsing, email validation/normalisation, lead scoring, eligibility
decisions, scheduling, inbox rotation, reply classification, analytics,
compliance decisions, SPF/DKIM/DMARC checks, deliverability decisions, or
inventing missing information. ("Live webpage extraction" — i.e. an AI
model fetching or browsing a page itself — is prohibited; extracting
keywords from a page's text *after* it has already been fetched and saved
by deterministic code is the one narrow, opt-in exception described above.)

All of the above are implemented as deterministic code in
`packages/leads`, `packages/research`, `packages/scheduling`,
`packages/conversations`, `packages/analytics`, and `packages/compliance`.

## Enforcement

1. **Import boundary.** Only `packages/email-generation` and
   `packages/research-keywords` may depend on `@google/genai` (or any other
   AI provider SDK). This is enforced two ways:
   - `tests/architecture/ai-boundary.test.ts` scans every `.ts`/`.tsx` file
     in `apps/` and `packages/` for forbidden import patterns and scans every
     `package.json` for a forbidden dependency, failing CI if any package
     other than those two matches.
   - `eslint.config.js` sets `no-restricted-imports` against
     `@google/genai` / `@anthropic-ai/sdk` / `openai` for every package
     except those two.
2. **Input boundary** (Phase 5). The model receives a compact, structured
   fact payload plus, as one narrow and explicitly-labeled exception, a
   bounded excerpt of the subject's own already-fetched website text (see
   "Allowed uses" above) — never search result pages, scripts, hidden page
   content, private profile data, or unbounded/whole-page raw text.
   Note: `createResearchSnapshot` (`packages/research/src/snapshot.ts`)
   currently includes facts with status `OBSERVED` *or* `USER_CONFIRMED` —
   a fact does not strictly require a human to click "Accept" before it can
   reach a draft, only to not be rejected/conflicted/expired. Tightening
   this to `USER_CONFIRMED`-only is a known possible follow-up, not yet done.
3. **Output boundary** (Phase 5). A deterministic validator (no second LLM
   call) rejects any generation that references facts, numbers, company
   names, awards, books, conferences, customers, or funding not present in
   the approved fact set, or that contains prohibited personal information,
   forbidden phrases, unresolved placeholders, more than one CTA, or
   excessive length.
4. **Escape hatch.** When there isn't enough verified context to
   personalise an email, the model is instructed — and allowed — to return
   `INSUFFICIENT_VERIFIED_CONTEXT` instead of inventing content.
5. **Untrusted input.** All research content passed to the model is treated
   as untrusted data. Instructions embedded in scraped/enriched content are
   never followed; the system prompt is fixed and cannot be overridden by
   fact values.
