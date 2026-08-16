# Authentication & multi-tenancy

## Stack

Auth.js v5 (`next-auth@5.0.0-beta`) with the Prisma adapter, configured in
`packages/authentication/src/auth.config.ts` and instantiated in
`apps/web/src/lib/auth.ts`. Two providers:

- **Credentials** (email + password). `authorize()` rejects unverified
  emails and wrong passwords with the same generic error, and never
  distinguishes "no such user" from "wrong password".
- **Google** — application sign-in only. This is a completely separate
  OAuth client/token set from the Gmail sending inboxes added in Phase 6;
  never reuse credentials or tokens between the two.

### Why JWT sessions, not database sessions

Auth.js cannot persist adapter (database) sessions for users who sign in via
the Credentials provider — only OAuth providers get that. Session strategy
is therefore JWT for every provider. To still support forcing a logout after
a password reset, `User.passwordChangedAt` is embedded in the JWT at sign-in
and re-checked against the database on every subsequent request; a mismatch
sets `session.error = "PasswordChanged"`, which `(app)/layout.tsx` checks
before rendering protected pages.

## Tenant isolation

`packages/authentication/src/tenant.ts` exports
`requireOrganisationMembership(prisma, { userId, organisationId, permission? })`
— the only sanctioned way to authorize an organisation-scoped action. It
re-derives access from the database using the session's `userId` (never an
`organisationId` supplied by the client) and throws `ForbiddenError` if
there's no membership row or the role lacks the required permission. Every
API route under `/api/organisations/**` and the "active organisation" cookie
resolution (`apps/web/src/lib/current-organisation.ts`) go through this.

The active-organisation cookie itself is untrusted input — a client could
tamper with it — so `getCurrentOrganisation()` always re-validates it via
`requireOrganisationMembership` before use, falling back to the user's first
membership if the cookie is stale or forged.

## Roles & permissions

`OWNER > ADMIN > MEMBER > VIEWER` (see `packages/authentication/src/permissions.ts`
for the exact matrix). Notable rules enforced in `members.ts`:

- Only an `OWNER` can grant or revoke the `OWNER` role (`canAssignRole`).
- An organisation can never be left without at least one `OWNER` — demoting
  or removing the last owner is rejected.
- Only an `OWNER` holds `organisation:delete`. `deleteOrganisation`
  (`packages/authentication/src/organisations.ts`) is the one place an
  organisation and everything scoped to it (leads, campaigns, inboxes, all
  of it) is erased — via the schema's own cascade deletes, not a manual
  per-table walk. It requires the caller to pass the organisation's exact
  current name as `confirmName`, checked in the function itself rather than
  trusted to the route/tool layer, since nothing about this is undoable.
  The `ORGANISATION_DELETED` audit event is written *without*
  `organisationId` — `AuditEvent`'s own FK to `Organisation` is
  `onDelete: Cascade`, so a row that pointed at the org being deleted would
  vanish in the same transaction, erasing the record of the deletion along
  with everything else. Exposed at `DELETE /api/organisations/:id` and as
  the `delete_organisation` MCP tool.

## Invitations

Tokens are single-use, generated with `crypto.randomBytes(32)`, and only the
SHA-256 **hash** of a token is ever stored (`hashToken()` in `tokens.ts`) —
a database read alone can never be replayed into a working invite/reset/
verification link. Creating a new invitation for the same org+email
supersedes (revokes) any prior pending one. Accepting an invitation requires
being signed in with the exact invited email address, and creates the
membership + marks the invitation accepted inside one transaction.

## Email verification / password reset are explicit actions, not GET side effects

Both `/verify-email` and password reset links render a page with a button
the user must click, which then POSTs to consume the token — visiting the
link (e.g. via an email client's link-prefetching/security-scanning) does
**not** consume it. An earlier draft verified directly in a Server Component
on page load; this was corrected before shipping specifically because email
security scanners routinely pre-fetch links in emails, which would have
silently burned one-time tokens before the real user ever saw the page.

## Known gotchas hit while building this (fixed, documented so they don't recur)

- **`/onboarding` must not live inside the `(app)` route group.** That
  group's layout redirects to `/onboarding` whenever the signed-in user has
  no organisation — nesting the onboarding page inside the same group
  redirects to itself in an infinite loop. It's a top-level route with its
  own lightweight auth check instead.
- **Turborepo strips env vars by default.** Turborepo v2's default
  `envMode` is `"strict"` — only env vars listed in `turbo.json`'s
  `globalEnv` (or a task's own `env`) reach a task's process. Without this,
  `pnpm build` (which runs through turbo) silently loses every environment
  variable even though `next build` run directly picks them up fine,
  producing a confusing "Invalid environment configuration" failure deep in
  page-data collection.
- **`NODE_ENV` must not be pre-set when running `next build`.** Next sets
  its own `NODE_ENV=production` internally; a pre-exported `NODE_ENV` (e.g.
  from `source .env`) overrides that and triggers an unrelated, misleading
  `<Html> should not be imported outside of pages/_document` failure during
  static generation of the built-in `/404`/`/500` pages.
- **Design system components using hooks must declare `"use client"`
  themselves.** A Server Component importing the shared component barrel
  (`@mail-orbyt/design-system`) fails to build if any hook-using component
  in that barrel (Dialog, DropdownMenu, Tabs, Toast, form inputs, etc.)
  lacks its own directive — Next's client-boundary analysis follows the
  whole module graph, not just the named imports actually used.
- **A `<button>` can never contain another `<button>`.** `DropdownMenu`
  used to wrap its `trigger` in an owned `<button>`; passed a `<Button>` as
  the trigger (as the members-invite UI does), this produced invalid,
  hydration-breaking HTML. Fixed by cloning the trigger element
  (`cloneElement`) instead of wrapping it. `Chip` had the same issue when it
  rendered a remove `<button>` inside its own interactive `<button>`; fixed
  by making the chip itself a `role="button"` span instead of a real
  `<button>` when it also has a nested remove control.
