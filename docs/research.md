# Deterministic research and enrichment

Phase 4 adds "research" — background enrichment of leads and companies with
verifiable facts. This is deliberately **not AI**: every fact stored here is
extracted by deterministic code from a specific document, with a source URL
and (where available) an evidence excerpt, so a human can always check where
a claim came from. See [AI usage boundaries](ai-boundaries.md) for why AI is
never used for this — `packages/research` never imports an AI SDK, and the
architecture test in `tests/architecture/ai-boundary.test.ts` enforces it.

## Pipeline

1. `createResearchJob` creates a `ResearchJob` row scoped to a `LEAD` or
   `COMPANY` subject.
2. `processResearchJob` (in `packages/research/src/research-job-service.ts`)
   runs one `ResearchProviderRun` per provider kind:
   - **WEBSITE** — always runs. Fetches the subject's website URL
     (`packages/research/src/website-fetcher.ts`), which manually follows
     redirects (max 5 hops, re-validating every hop through the SSRF guard),
     enforces a 10s timeout and a 2MB body cap.
   - **SEARCH / NEWS / ENRICHMENT** — optional third-party providers. No
     provider is wired to a real API yet (no keys configured), so the
     default `NotConfigured*Provider` implementations report
     `isConfigured() === false` and the run is recorded as
     `SKIPPED_NOT_CONFIGURED` rather than silently doing nothing or failing
     the job.
3. The fetched HTML is run through three extractors, in priority order —
   later ones only run if an earlier one produced nothing:
   1. **JSON-LD** (`extraction/json-ld.ts`) — `Person` nodes for LEAD
      subjects, `Organization` nodes for COMPANY subjects.
   2. **Open Graph** (`extraction/open-graph.ts`) — `og:description` only.
   3. **Meta tag** (`extraction/open-graph.ts`) — `<meta name="description">`,
      last-resort fallback.
4. Each extracted candidate is mapped to a `ResearchFact` with a category
   from a fixed taxonomy (`packages/research/src/categories.ts`), a
   confidence score, the source URL, and (for OG/meta) an evidence excerpt.
   Every category is checked against a hard-coded prohibited list (health,
   political affiliation, private contact info, etc.) before being stored,
   even though the extractor mappings should never produce one — defense in
   depth, not the only check.
5. Facts are reviewable in the UI (`ResearchPanel` component, shared between
   the lead drawer and company page) — a human can Accept (`USER_CONFIRMED`)
   or Reject (`USER_REJECTED`) each one. Editing a fact's value marks it
   `CONFLICTED` rather than silently overwriting it, per the spec's
   requirement that conflicting facts are never silently merged.

## Idempotency

Reprocessing a job is safe at two levels:

- `processResearchJob` early-returns if the job is already `COMPLETED`.
- Each provider run is checkpointed independently — `runWebsiteProvider`
  skips work if its `ResearchProviderRun` is already `SUCCEEDED` or `FAILED`.
- `upsertFact` dedupes on `(organisationId, leadId/companyId, category,
value)` — a rerun updates `observedAt`/`confidence` on the existing fact
  instead of creating a duplicate.

## Known gotchas hit while building this phase

- **IPv6 literals bypassing the SSRF guard's IP check.** WHATWG's
  `URL.hostname` keeps the brackets around an IPv6 literal
  (`new URL("http://[::1]/").hostname === "[::1]"`), but `node:net`'s
  `isIP()` doesn't recognize the bracketed form. Without stripping the
  brackets first, `http://[::1]/` fell through to the DNS-lookup path
  instead of being caught by the direct-IP check, and the test's mocked
  `dns.lookup()` (not configured for that specific case) returned
  `undefined`, causing a `TypeError` instead of the expected
  `UnsafeUrlError`. Fixed in `packages/research/src/ssrf-guard.ts` by
  stripping `^\[|\]$` from `url.hostname` before the `isIP` check.
- **Provider "configured" check via an empty-query probe.** The first draft
  of `providers.ts` had callers check whether a provider was configured by
  calling `provider.search("")` and reading a `.configured` flag off the
  result — semantically wrong, since a real provider shouldn't receive a
  meaningless empty-string query just to be probed. Replaced with a
  first-class `isConfigured(): boolean` method on each provider interface,
  checked directly instead of awaiting a real call.
- **Local test HTTP servers vs. the SSRF guard.** The integration test
  (`tests/integration/research-job.test.ts`) needs a real HTTP server to
  fetch from, which necessarily binds to `127.0.0.1` — a loopback address
  the SSRF guard correctly and unconditionally blocks in production. The
  guard is mocked to a pass-through in that one file only; real SSRF
  behavior is exhaustively covered by `packages/research/src/ssrf-guard.test.ts`
  and `website-fetcher.test.ts`.
- **Multi-word lead search returning zero results.** Found via live
  end-to-end testing, not a unit test: searching "Patrick Collison" in the
  leads list returned nothing even though the lead existed, because the old
  search logic checked `firstName contains "Patrick Collison"` /
  `lastName contains "Patrick Collison"` — no single field contains the full
  two-word string. Fixed in `packages/leads/src/leads-service.ts` by
  splitting the search string on whitespace and requiring every word to
  match at least one field (`AND` of per-word `OR`s). This is a leads-search
  fix, not a research-pipeline fix, but was discovered while verifying this
  phase end-to-end and is covered by new tests in `leads-service.test.ts`.

## Fact categories

The full allowed taxonomy (person and company) and the prohibited list live
in `packages/research/src/categories.ts`. `assertAllowedCategory` throws
`ProhibitedCategoryError` or `UnknownCategoryError` for anything outside it —
there is no code path that stores an arbitrary, unvalidated category string.
