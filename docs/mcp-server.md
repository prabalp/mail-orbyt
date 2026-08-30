# Remote MCP connector

`apps/mcp-server` lets Claude (via claude.ai's remote MCP connector, or any
other MCP-compatible client) perform the same actions the web UI does —
managing leads, campaigns, conversations, research, analytics, and more —
scoped to the same per-organisation permissions the connecting user actually
holds.

## Architecture

Two pieces work together:

1. **The OAuth 2.1 authorization server**, implemented as ordinary Next.js
   routes inside `apps/web` (`/.well-known/oauth-authorization-server`,
   `/api/oauth/register`, `/oauth/authorize`, `/api/oauth/token`,
   `/api/oauth/revoke`). It reuses the existing NextAuth session for the
   human login/consent step, and issues its own opaque, hashed-at-rest
   access/refresh tokens (see `packages/mcp-oauth`) — entirely separate from
   the NextAuth session cookie.
2. **The MCP protocol server**, `apps/mcp-server`, a small standalone Node
   process (modeled on `apps/worker`) speaking MCP over Streamable HTTP.
   Every tool call is translated into an HTTP request against `apps/web`'s
   own REST API, forwarding the caller's own access token — the same Zod
   validation and `requireOrganisationMembership`/permission checks the web
   UI is subject to apply here too. The only thing `apps/mcp-server` does
   directly against the database is verify the bearer token itself, so an
   invalid/expired token is rejected before a network round-trip.

```
claude.ai  --OAuth (DCR, PKCE)-->  apps/web  (/oauth/*, /.well-known/*)
claude.ai  --MCP Streamable HTTP--> apps/mcp-server (/mcp)
apps/mcp-server --Bearer token--> apps/web REST API
```

## Authorization flow

1. The client discovers `${APP_URL}/.well-known/oauth-authorization-server`
   and registers itself via `POST /api/oauth/register` (Dynamic Client
   Registration, RFC 7591) — a public client, no client secret, since PKCE
   secures the code exchange instead.
2. The client sends the user to `/oauth/authorize` with a PKCE
   `code_challenge` and requested `scope`. If not already signed in, the
   user is bounced through `/sign-in?callbackUrl=...` and back.
3. The consent screen lets the user pick which organisation the connection
   is for, and shows the scopes being requested in plain language.
   Approving calls `createAuthorizationCode` (`packages/mcp-oauth`), which
   re-derives the user's CURRENT role for the chosen organisation and
   narrows the granted scope to what that role actually holds — never what
   the client asked for.
4. The client exchanges the code (+ PKCE verifier) at `POST /api/oauth/token`
   for an access token (~1h) and refresh token (~90d, rotated on every use).
5. Every subsequent call — to `apps/mcp-server`'s `/mcp` endpoint, or
   directly to `apps/web`'s REST API — carries `Authorization: Bearer
<access token>`. A token is bound to exactly one organisation; it can
   never reach a different one even if the user belongs to several.

Users can review and revoke active connections at **Settings → MCP
connections**.

## Tool surface

`apps/mcp-server/src/tools/*.ts` defines one MCP tool per REST endpoint
(leads, companies, campaigns, conversations, research, analytics, meetings,
inboxes, signatures, members, invitations, settings, compliance, DNS checks,
lead lists, email drafts, organisations, suppressions, MCP connections) as a
data-driven descriptor — method, path template, Zod input shape, required
scope, MCP annotations, and (for reads) an output schema — consumed by a
single generic handler (`apps/mcp-server/src/tools/registry.ts`) rather than
one hand-written function per tool. `apps/mcp-server/src/tools/composite.ts`
holds the exception: tools that call a _composite_ apps/web route (one that
itself orchestrates several services) rather than a 1:1 REST passthrough —
see "Composite tools" below.

89 route-backed tools plus 1 link tool (`get_gmail_connect_url`), enforced
and covered by `apps/mcp-server/src/tools/registry.test.ts` (descriptor
integrity — no duplicate names, every scope real, every path param declared,
every pathTemplate resolves to a real apps/web route) and
`scope-enforcement.test.ts` (every tool rejects a connection missing its
scope and reaches `fetch` once it holds it).

### Server capabilities beyond tools

- **Instructions** (`instructions.ts`): sent once at initialize — the core
  workflow, the qualified-meeting-rate north star, when to prefer composite
  tools, and the product's deliberate non-goals (no send-reply tool, no AI
  reply classification).
- **Resources** (`resources.ts`): read-only, attachable-without-a-tool-call
  views at stable URIs — `mail-orbyt://org/overview`, `mail-orbyt://analytics`,
  `mail-orbyt://lead/{leadId}`, `mail-orbyt://campaign/{campaignId}`. Same
  bearer token and permission checks as the equivalent tool.
- **Prompts** (`prompts.ts`): `plan_campaign`, `triage_replies`,
  `draft_follow_up`, `onboard_inbox` — reusable starting points that encode
  the right tool-call ORDER for a multi-step ask.
- **Tool annotations**: every descriptor declares `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint` (see
  `registry.ts`'s `ToolAnnotations`) so a client knows what it can run
  without confirmation and what it can't.
- **Structured output**: reads declare an `outputShape` (a permissive,
  all-optional Zod shape) and the response carries `structuredContent`
  alongside the text — see `create-server.ts`'s `toStructuredContent`.
- **Audit logging** (`audit.ts`): every tool call records an
  `MCP_TOOL_INVOKED` audit event (tool name, client, outcome — never
  arguments, which routinely contain lead emails and draft copy).
- **Rate limiting** (`rate-limit.ts`): 120 requests/60s per (client, user,
  organisation), fixed-window via Redis, fails open if Redis is unreachable.
- **Error normalization** (`registry.ts`'s `ToolRequestError`): upstream
  4xx/5xx responses are mapped to a message carrying the field-level detail
  and a `retryable` flag (5xx/429 vs. 4xx), plus guidance for 401/403/404.
- **JSON Schema dialect fix** (`schema-dialect-fix.ts`): the SDK's own
  Zod→JSON-Schema conversion hardcodes `$schema: draft-07`, which at least
  one real MCP client rejects outright — every call to a tool with a
  declared `outputSchema` fails before it reaches the handler, for every
  such tool, silently. `create-server.ts` calls `fixToolSchemaDialect`
  after every tool is registered to rewrite the advertised dialect to
  2020-12. Regression-tested end to end in `schema-dialect-fix.test.ts`
  (constructs a real server and asserts no tool advertises draft-07).

### Composite tools

The piecewise tool set (one tool per REST endpoint) makes "set up a
campaign" or "check on the organisation" a long chain of round trips. These
collapse the common chains into one call, backed by a route in apps/web
that does the orchestration server-side — the MCP layer itself stays a thin
passthrough, same as every other tool:

| Tool                                            | Backing route                      | Replaces                                                                                       |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `create_campaign_with_sequence`                 | `POST .../campaigns/with-sequence` | create_campaign + add_campaign_step ×N + set_campaign_inboxes + enroll_leads_in_campaign       |
| `get_campaign_overview`                         | `GET .../campaigns/{id}/overview`  | get_campaign + list_campaign_enrollments + analytics for one campaign                          |
| `get_org_overview`                              | `GET .../overview`                 | list_inboxes + list_campaigns + list_conversations + analytics, summarized                     |
| `retarget_leads`                                | `POST .../campaigns/{id}/retarget` | list_campaign_retargetable_leads + enroll_leads_in_campaign                                    |
| `find_lead`                                     | `GET .../leads` (search)           | resolving a name/email to a leadId before any other lead tool                                  |
| `connect_inbox` / `get_inbox_connection_status` | `GET .../inboxes/connect-guide`    | get_gmail_connect_url + a hand-written checklist + manual polling                              |
| `get_job_status`                                | `GET .../jobs/{kind}/{jobId}`      | three different polling shapes (ResearchJob, ImportBatch, ResearchKeywordRun) unified onto one |

`create_campaign_with_sequence` rolls back (archives) the campaign if any
step after creation fails, so a failed assembly never leaves a half-built
campaign visible in the user's campaign list.

`enroll_leads_in_campaign` additionally accepts `leadEmails` (resolved to
lead ids server-side, scoped to the organisation) alongside the existing
`leadIds`/`leadListId`, since an assistant is rarely handed a raw cuid.

### Full tool list

Every tool, grouped by the file it's defined in. `RO` = read-only,
`⚠` = destructive. Scope is the `requiredScope` — `profile` means
membership-only, no specific permission.

| Tool                               | Scope                |                                                                                    |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| **leads.ts**                       |                      |                                                                                    |
| `list_leads`                       | profile              | RO                                                                                 |
| `bulk_update_leads`                | leads:manage         | ⚠ (can hard-delete)                                                                |
| `get_lead`                         | profile              | RO                                                                                 |
| `delete_lead`                      | leads:manage         | ⚠                                                                                  |
| `list_lead_email_drafts`           | profile              | RO                                                                                 |
| `generate_lead_email_draft`        | campaigns:manage     |                                                                                    |
| `list_lead_emails`                 | profile              | RO                                                                                 |
| `export_lead_data`                 | leads:manage         | RO                                                                                 |
| `get_lead_research`                | profile              | RO                                                                                 |
| `start_lead_research`              | research:review      |                                                                                    |
| `get_lead_research_keywords`       | profile              | RO                                                                                 |
| `start_lead_research_keywords`     | research:review      |                                                                                    |
| `export_leads`                     | profile              | RO (CSV)                                                                           |
| `export_selected_leads`            | profile              | RO (CSV)                                                                           |
| `list_lead_import_batches`         | profile              | RO                                                                                 |
| `preview_lead_import`              | leads:manage         |                                                                                    |
| `confirm_lead_import`              | leads:manage         |                                                                                    |
| `get_lead_import_batch`            | profile              | RO                                                                                 |
| **organisations.ts**               |                      |                                                                                    |
| `list_my_organisations`            | profile              | RO                                                                                 |
| `create_organisation`              | profile              |                                                                                    |
| `get_organisation`                 | profile              | RO                                                                                 |
| `delete_organisation`              | organisation:delete  | ⚠ (erases the entire organisation; requires the exact current name as confirmName) |
| **companies.ts**                   |                      |                                                                                    |
| `list_companies`                   | profile              | RO                                                                                 |
| `get_company`                      | profile              | RO                                                                                 |
| `get_company_research`             | profile              | RO                                                                                 |
| `start_company_research`           | research:review      |                                                                                    |
| `get_company_research_keywords`    | profile              | RO                                                                                 |
| `start_company_research_keywords`  | research:review      |                                                                                    |
| **campaigns.ts**                   |                      |                                                                                    |
| `list_campaigns`                   | profile              | RO                                                                                 |
| `create_campaign`                  | campaigns:manage     |                                                                                    |
| `get_campaign`                     | profile              | RO                                                                                 |
| `update_campaign`                  | campaigns:manage     |                                                                                    |
| `archive_campaign`                 | campaigns:manage     | (reversible)                                                                       |
| `add_campaign_step`                | campaigns:manage     |                                                                                    |
| `reorder_campaign_steps`           | campaigns:manage     |                                                                                    |
| `update_campaign_step`             | campaigns:manage     |                                                                                    |
| `delete_campaign_step`             | campaigns:manage     | ⚠                                                                                  |
| `list_campaign_enrollments`        | profile              | RO                                                                                 |
| `enroll_leads_in_campaign`         | campaigns:manage     |                                                                                    |
| `unenroll_lead_from_campaign`      | campaigns:manage     | (reversible)                                                                       |
| `set_campaign_inboxes`             | campaigns:manage     |                                                                                    |
| `list_campaign_retargetable_leads` | profile              | RO                                                                                 |
| `force_send_campaign_now`          | campaigns:manage     | ⚠ (sends real email; non-prod only)                                                |
| `send_campaign_test`               | campaigns:manage     | ⚠ (sends real email)                                                               |
| **conversations.ts**               |                      |                                                                                    |
| `list_conversations`               | conversations:review | RO                                                                                 |
| `get_conversation`                 | conversations:review | RO                                                                                 |
| **research.ts**                    |                      |                                                                                    |
| `list_research_jobs`               | profile              | RO                                                                                 |
| `update_research_fact`             | research:review      |                                                                                    |
| **analytics.ts**                   |                      |                                                                                    |
| `get_analytics`                    | analytics:view       | RO                                                                                 |
| **meetings.ts**                    |                      |                                                                                    |
| `list_meetings`                    | profile              | RO                                                                                 |
| `create_meeting`                   | conversations:review |                                                                                    |
| `update_meeting`                   | conversations:review |                                                                                    |
| **inboxes.ts**                     |                      |                                                                                    |
| `list_inboxes`                     | profile              | RO                                                                                 |
| `update_inbox_send_limit`          | inboxes:manage       |                                                                                    |
| `disconnect_inbox`                 | inboxes:manage       | ⚠                                                                                  |
| **signatures.ts**                  |                      |                                                                                    |
| `list_signatures`                  | profile              | RO                                                                                 |
| `create_signature`                 | inboxes:manage       |                                                                                    |
| `update_signature`                 | inboxes:manage       |                                                                                    |
| `delete_signature`                 | inboxes:manage       | ⚠                                                                                  |
| **members.ts**                     |                      |                                                                                    |
| `list_members`                     | profile              | RO                                                                                 |
| `update_member_role`               | members:manage       |                                                                                    |
| `remove_member`                    | members:manage       | ⚠                                                                                  |
| **invitations.ts**                 |                      |                                                                                    |
| `list_invitations`                 | members:manage       | RO                                                                                 |
| `invite_member`                    | members:manage       |                                                                                    |
| **settings.ts**                    |                      |                                                                                    |
| `get_ai_provider_settings`         | profile              | RO                                                                                 |
| `update_ai_provider_settings`      | campaigns:manage     |                                                                                    |
| `get_email_template_settings`      | profile              | RO                                                                                 |
| `update_email_template_settings`   | campaigns:manage     |                                                                                    |
| `preview_email_prompt`             | profile              | RO                                                                                 |
| **compliance.ts**                  |                      |                                                                                    |
| `purge_stale_data`                 | organisation:delete  | ⚠                                                                                  |
| **dns-checks.ts**                  |                      |                                                                                    |
| `check_domain_dns`                 | inboxes:manage       | live external DNS lookup                                                           |
| **lead-lists.ts**                  |                      |                                                                                    |
| `list_lead_lists`                  | profile              | RO                                                                                 |
| `create_lead_list`                 | leads:manage         |                                                                                    |
| **email-drafts.ts**                |                      |                                                                                    |
| `approve_email_draft`              | campaigns:manage     |                                                                                    |
| `delete_email_draft`               | campaigns:manage     | ⚠                                                                                  |
| **suppressions.ts**                |                      |                                                                                    |
| `list_suppressions`                | profile              | RO                                                                                 |
| `check_suppression`                | profile              | RO                                                                                 |
| `add_suppression`                  | leads:manage         |                                                                                    |
| `remove_suppression`               | leads:manage         | ⚠                                                                                  |
| **mcp-connections.ts**             |                      |                                                                                    |
| `list_mcp_connections`             | profile              | RO                                                                                 |
| `revoke_mcp_connection`            | profile              | ⚠ (can end the calling connection itself)                                          |
| **composite.ts**                   |                      |                                                                                    |
| `create_campaign_with_sequence`    | campaigns:manage     |                                                                                    |
| `get_campaign_overview`            | profile              | RO                                                                                 |
| `get_org_overview`                 | profile              | RO                                                                                 |
| `retarget_leads`                   | campaigns:manage     |                                                                                    |
| `find_lead`                        | profile              | RO                                                                                 |
| `connect_inbox`                    | inboxes:manage       | RO (builds a link only)                                                            |
| `get_inbox_connection_status`      | profile              | RO                                                                                 |
| `get_job_status`                   | profile              | RO                                                                                 |
| **gmail.ts** (link tool)           |                      |                                                                                    |
| `get_gmail_connect_url`            | inboxes:manage       | RO (builds a link only)                                                            |

## Configuration

New environment variables (see `.env.example`, validated in
`packages/config/src/env.ts`):

| Variable                       | Default                                                | Purpose                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_SERVER_PORT`              | `3001`                                                 | Port `apps/mcp-server` listens on                                                                                                                                                                                   |
| `MCP_ACCESS_TOKEN_TTL_MINUTES` | `60`                                                   | Access token lifetime                                                                                                                                                                                               |
| `MCP_REFRESH_TOKEN_TTL_DAYS`   | `90`                                                   | Refresh token lifetime                                                                                                                                                                                              |
| `MCP_SERVER_URL`               | `APP_URL`'s host with `MCP_SERVER_PORT` substituted in | `apps/mcp-server`'s own public URL, advertised in its protected-resource metadata — override if it's deployed behind a different host/path than that (e.g. a single reverse-proxied origin with path-based routing) |

`apps/mcp-server` also reuses `REDIS_URL` for per-connection rate limiting
(120 requests/60s per client+user+organisation — see `src/rate-limit.ts`);
there is no separate variable for the limit itself, since it's a
runaway-loop backstop rather than a usage quota meant to be tuned per
deployment.

## Local testing

`apps/mcp-server` and the OAuth endpoints in `apps/web` both need to be
reachable over HTTPS for a **remote** client like claude.ai to connect —
`localhost` only works for tools that connect to a local process directly
(e.g. the MCP Inspector). For local testing with claude.ai, put both behind
a tunnel (ngrok, Cloudflare Tunnel) or use a real deployment.

To test locally without a tunnel:

```bash
pnpm --filter @mail-orbyt/mcp-server dev
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```
