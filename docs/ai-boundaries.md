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

## Prohibited uses

AI must never be used for: scraping, browsing, webpage extraction, CSV
parsing, email validation/normalisation, lead scoring, eligibility
decisions, scheduling, inbox rotation, reply classification, analytics,
compliance decisions, SPF/DKIM/DMARC checks, deliverability decisions, or
inventing missing information.

All of the above are implemented as deterministic code in
`packages/leads`, `packages/research`, `packages/scheduling`,
`packages/conversations`, `packages/analytics`, and `packages/compliance`.

## Enforcement

1. **Import boundary.** Only `packages/email-generation` may depend on
   `@anthropic-ai/sdk` (or any other AI provider SDK). This is enforced two
   ways:
   - `tests/architecture/ai-boundary.test.ts` scans every `.ts`/`.tsx` file
     in `apps/` and `packages/` for forbidden import patterns and scans every
     `package.json` for a forbidden dependency, failing CI if any package
     other than `@mail-orbyt/email-generation` matches.
   - `eslint.config.js` sets `no-restricted-imports` against
     `@anthropic-ai/sdk` / `openai` for every package except
     `packages/email-generation`.
2. **Input boundary** (Phase 5). The model receives only a compact,
   structured fact payload — never full webpages, raw HTML, search result
   pages, scraped text, scripts, hidden page content, or private profile
   data. Only `USER_CONFIRMED` research facts may be included.
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
