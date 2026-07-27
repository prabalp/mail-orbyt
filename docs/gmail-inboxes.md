# Gmail OAuth, inbox management, and DNS checks

Phase 6 lets an organisation connect one or more Gmail mailboxes to send
from, and surfaces the SPF/DKIM/DMARC health of the domains they send from.
No email is actually sent yet — that's Phase 8 (scheduler/outbox/sending);
this phase is connection, storage, and deliverability visibility only.

## A separate OAuth client from login

`packages/gmail` uses `GMAIL_OAUTH_CLIENT_ID`/`GMAIL_OAUTH_CLIENT_SECRET` —
a completely separate Google OAuth client from the one
`packages/authentication` uses for the "Sign in with Google" login button
(`GOOGLE_LOGIN_CLIENT_ID`/`SECRET`). Login and sending credentials never
share a client, a token, or a scope grant. The `Account` Prisma model (login)
and the new `Inbox` model (sending) are separate tables with separate token
storage, and `packages/gmail`'s comment on `Inbox` calls this out explicitly.

## OAuth flow

1. `GET /api/gmail/oauth/start?organisationId=...` — requires
   `inboxes:manage` (OWNER/ADMIN only). Generates a random CSRF `state`,
   stores it plus the target `organisationId` in short-lived httpOnly
   cookies, and redirects to Google's real consent screen
   (`accounts.google.com/o/oauth2/v2/auth`) with `access_type=offline` and
   `prompt=consent` so a refresh token is always issued.
2. `GET /api/gmail/oauth/callback` — verifies the `state` cookie matches the
   query param (rejecting the request entirely otherwise), re-checks
   `inboxes:manage` for the organisation stored in the cookie, exchanges the
   code for tokens, fetches the connected mailbox's email address, and
   upserts an `Inbox` row. Reconnecting the same mailbox replaces its stored
   tokens rather than creating a duplicate. A DNS check for the mailbox's
   domain is triggered automatically on first connect.

## Token storage

Access and refresh tokens are encrypted at rest with AES-256-GCM
(`packages/gmail/src/token-crypto.ts`) using `TOKEN_ENCRYPTION_KEY`, packed
as `iv:authTag:ciphertext` (each base64). Decryption fails loudly
(`TokenDecryptionError`) rather than silently on a tampered or
wrong-key-encrypted value, since GCM's auth tag makes tampering detectable.
`getValidAccessToken` transparently refreshes an expiring/expired access
token (60s margin) and persists the new one before returning it — callers
never see a stale token.

Disconnecting an inbox (`disconnectInbox`) makes a best-effort call to
Google's revoke endpoint before marking the row `DISCONNECTED`, so the
token can't be reused even if a copy of it ever leaked. Revocation failing
doesn't block disconnection — the user's intent to disconnect always wins.

## DNS checks are deterministic, not AI

`packages/gmail/src/dns-check.ts` resolves real DNS TXT records —
`node:dns/promises`' `resolveTxt`, nothing else:

- **SPF** — looks for a `v=spf1` TXT record on the domain itself.
- **DMARC** — looks for a `v=DMARC1` TXT record at `_dmarc.<domain>`;
  `p=reject` or `p=quarantine` is PASS, `p=none` is FAIL (published but not
  enforcing).
- **DKIM** — requires a selector. DKIM selectors (the `s1` in
  `s1._domainkey.example.com`) aren't fixed or guessable — Google Workspace
  assigns one per domain, visible only in the admin console — so DKIM stays
  `UNKNOWN` until a user supplies one, rather than being reported as a false
  FAIL/MISSING.

A DNS lookup failure (NXDOMAIN, timeout) is treated as an empty record set,
not an error — the check reports MISSING rather than crashing the request.

## Verification

- **Unit tests** (`packages/gmail`, 29 tests): token encryption round-trip
  and tamper detection (real AES-256-GCM, no mocking), the OAuth
  authorization-URL/token-exchange/refresh/userinfo/revoke calls (mocked at
  the `fetch` boundary — no real Google credentials exist in this
  environment), and inbox connect/list/update/disconnect service logic
  (fake Prisma) including org-scoping checks.
- **Integration test** (`tests/integration/dns-check.test.ts`, 3 tests):
  real, unmocked DNS resolution against `google.com` (which publishes a real
  SPF record and a `p=reject` DMARC policy) and a nonexistent subdomain —
  this is the same "test against real infrastructure" pattern used for
  research/website-fetching in Phase 4.
- **Live verification against the running dev server**: signed in as the
  seeded demo owner, confirmed `GET .../inboxes` returns an empty list,
  `GET /api/gmail/oauth/start` correctly 307-redirects to a real
  `accounts.google.com` URL with the right client ID, scopes, and CSRF
  state; a callback request with a mismatched `state` is correctly rejected
  and redirects to `/inboxes?gmailOAuth=error`; `POST .../dns-checks` for
  `google.com` returned real `PASS`/`PASS`/`UNKNOWN` (SPF/DMARC/DKIM)
  results matching the live DNS records fetched independently via `dig`-
  equivalent Node calls; and a MEMBER-role user correctly received `403` on
  the OAuth start endpoint (only OWNER/ADMIN have `inboxes:manage`).

## Limitation

Completing the actual OAuth code exchange against Google (steps 2 onward of
the flow) was not exercised end-to-end in this environment — that requires
a real `GMAIL_OAUTH_CLIENT_ID`/`SECRET` and a real Google account
consenting in a browser, neither of which exist here. Everything up to and
including the redirect to Google, and the callback's state-validation and
error-handling paths, were verified live; the token-exchange/upsert code
path itself is covered by unit tests with a mocked `fetch`. A real
deployment's first manual QA pass should connect one real Gmail inbox
end-to-end before relying on this feature.
