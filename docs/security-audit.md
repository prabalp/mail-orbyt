# Security audit, load testing, and hardening

Phase 12 is the final pass over the whole product: a security review, real
(if modest) load testing, and closing the gaps found.

## Findings and fixes

### 1. No rate limiting anywhere (fixed)

Before this phase, nothing in the product limited repeated attempts at
credential login, account sign-up, or password-reset requests — a real
brute-force, credential-stuffing, and email-bombing exposure.

Fixed with `packages/authentication/src/rate-limiter.ts`: a Redis-backed
fixed-window limiter (`INCR` + `EXPIRE`), correct across multiple app/worker
instances (an in-memory counter would reset per-process, which is not a
real fix). Wired into:

- **Credentials login** (`createCredentialsAuthorize`, extracted as a
  standalone function specifically so it could be unit-tested without
  fighting NextAuth v5's internal Credentials-provider wrapper) — keyed by
  email (the client IP isn't available in this callback), 10 attempts per
  15 minutes, checked _before_ the bcrypt password comparison so a flooded
  account can't also be used to force expensive hashing work, and reset on
  a successful login so a legitimate user isn't penalized by earlier typos.
- **Sign-up** (`POST /api/auth/sign-up`) — keyed by client IP, 5 per hour.
- **Forgot-password** (`POST /api/auth/forgot-password`) — keyed by _both_
  IP and target email (5 per 15 minutes each), since either "one attacker
  hammering one victim's inbox" or "one attacker enumerating many emails"
  is a real abuse pattern and each needs its own cap. A rate-limited
  request returns the exact same generic `{status: "ok"}` response as a
  real one — revealing that a request was throttled would itself leak
  whether that email has been targeted before.

**Verified live**: 12 consecutive failed logins against a real seeded
account, then a 13th attempt with the _correct_ password — correctly
rejected (`error=CredentialsSignin`, no session created). Confirmed
directly in Redis: the `login:<email>` counter was at 13 with a live TTL
of ~869s, matching the configured 15-minute window exactly.

### 2. No security response headers (fixed)

`next.config.mjs` now sets `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'` (belt-and-suspenders
clickjacking protection for browsers that prefer CSP over the older
header), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, and a locked-down `Permissions-Policy`
(camera/microphone/geolocation all denied — none are used). Verified live:
`curl -D -` against a running dev server shows all five headers present.

### 3. Reviewed and found already correct

- **SQL injection** — every database access goes through Prisma's
  parameterized query builder; no raw SQL string concatenation exists
  anywhere in the codebase (confirmed via a full-repo grep for
  `$queryRawUnsafe`/`$executeRawUnsafe` — none found; the one `$queryRaw`
  usage in `apps/worker`'s startup healthcheck is a static `SELECT 1`
  with no interpolated input).
- **XSS** — React escapes all rendered content by default; a full-repo
  grep for `dangerouslySetInnerHTML` found zero uses.
- **SSRF** — `packages/research`'s website fetcher and `packages/gmail`'s
  thread/send calls only ever hit either a fixed, hardcoded provider
  endpoint (Gmail API, Google OAuth) or a URL that has passed
  `assertSafeUrl` (Phase 4's SSRF guard — blocks private/loopback/
  link-local/cloud-metadata ranges, re-resolves hostnames to catch
  DNS-rebinding).
- **Tenant isolation** — every organisation-scoped API route calls
  `requireOrganisationMembership`, which re-validates the caller's
  membership against the database rather than trusting a client-supplied
  `organisationId` — this pattern was used consistently across every phase
  and is not something this audit needed to add.
- **Formula injection in CSV export** — `packages/leads`' `sanitizeCsvField`
  (Phase 3) already prefixes any field starting with `=`, `+`, `-`, `@`,
  tab, or CR with a `'` before writing to CSV, preventing a spreadsheet
  formula from executing when a exported file is opened in Excel/Sheets.
- **Secrets handling** — `.env` is gitignored; no secret, token, or API key
  appears in a committed file (confirmed via grep across
  `docker-compose.yml`, migration SQL, and seed data). The audit-event
  logger (`recordAuditEvent`) refuses to record metadata containing
  password/token/secret-shaped keys.
- **CSRF** — Auth.js's session cookie is `SameSite=Lax` by default (not
  overridden anywhere in `buildAuthConfig`), which blocks the cookie being
  sent on a cross-site `POST`, covering the standard CSRF attack shape for
  every session-cookie-authenticated API route.

## Load testing

A full production-scale load test (thousands of concurrent users against
a horizontally-scaled deployment) isn't something this sandboxed,
single-machine environment can honestly produce — there's no multi-instance
deployment, no realistic production dataset, and the server under test ran
in `next dev` (unoptimized) rather than a production build. What _was_ run,
honestly labeled as a smoke-level check rather than a capacity test:

- `ab -n 200 -c 10` and `ab -n 500 -c 50` against `/api/health` (a route
  that touches Postgres and Redis) — **0 failed requests** in both runs,
  ~338 req/s and ~464 req/s respectively, against a dev-mode server on a
  shared sandbox machine.

This confirms there's no immediate crash-under-modest-concurrency bug and
that the DB/Redis connection handling doesn't exhaust under a small burst
— it does **not** confirm production capacity, and a real deployment should
run a proper load test (k6, autocannon, or similar) against a production
build and a representative dataset before relying on a specific throughput
number.

## What was deliberately left out of scope

- **A dependency vulnerability scan** (`npm audit` / `pnpm audit` /
  Snyk-style CVE scanning) was not run as part of this pass — recommended
  as a CI step for a real deployment (see `docs/deployment.md`).
- **Penetration testing** against a live, internet-reachable instance —
  this environment has no such instance to test.
- **A Web Application Firewall or DDoS-mitigation layer** — expected to be
  provided by the hosting platform/CDN in front of the app, not by the
  app itself.
