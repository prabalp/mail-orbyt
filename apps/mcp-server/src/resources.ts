import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthenticatedActor } from "./auth-middleware.js";
import { fetchOrganisationJson } from "./api-client.js";

/**
 * Read-only views a client can ATTACH as context without spending a tool
 * call — "here is the lead I'm asking about" rather than a round trip to
 * get_lead first. Same bearer token, same REST API, same permission checks
 * as the equivalent tool; a resource can never read something its tool
 * counterpart couldn't.
 *
 * URIs are stable and organisation-relative: the organisation is implied by
 * the connection, so `mail-orbyt://org/overview` means "this connection's
 * organisation" and can never address another one.
 */
export function registerResources(server: McpServer, actor: AuthenticatedActor): void {
  const jsonContents = (uri: string, text: string) => ({
    contents: [{ uri, mimeType: "application/json", text }],
  });

  server.registerResource(
    "org-overview",
    "mail-orbyt://org/overview",
    {
      title: "Organisation overview",
      description:
        "Where things stand right now: inboxes and their DNS health, active campaigns, replies waiting on a human, qualified meeting rate, and suppression count.",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonContents(
        uri.href,
        await fetchOrganisationJson(actor, "/api/organisations/{organisationId}/overview"),
      ),
  );

  server.registerResource(
    "analytics",
    "mail-orbyt://analytics",
    {
      title: "Analytics",
      description:
        "Funnel and outcome metrics for the organisation, headlined by qualified meeting rate.",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonContents(
        uri.href,
        await fetchOrganisationJson(actor, "/api/organisations/{organisationId}/analytics"),
      ),
  );

  server.registerResource(
    "lead",
    new ResourceTemplate("mail-orbyt://lead/{leadId}", {
      // Listing every lead as a resource would page unboundedly and is what
      // list_leads is for; these are addressable-by-id only.
      list: undefined,
    }),
    {
      title: "Lead",
      description: "A single lead and its associated company, addressed by lead id.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      jsonContents(
        uri.href,
        await fetchOrganisationJson(
          actor,
          `/api/organisations/{organisationId}/leads/${encodeURIComponent(String(variables.leadId))}`,
        ),
      ),
  );

  server.registerResource(
    "campaign",
    new ResourceTemplate("mail-orbyt://campaign/{campaignId}", { list: undefined }),
    {
      title: "Campaign overview",
      description:
        "A campaign with its steps, enrollment counts by status, sending inbox pool, and headline stats.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      jsonContents(
        uri.href,
        await fetchOrganisationJson(
          actor,
          `/api/organisations/{organisationId}/campaigns/${encodeURIComponent(String(variables.campaignId))}/overview`,
        ),
      ),
  );
}
