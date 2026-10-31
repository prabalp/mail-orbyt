import { prisma } from "@mail-orbyt/database";
import { PageHeader } from "@mail-orbyt/design-system";
import { listActiveConnections, listPersonalTokens } from "@mail-orbyt/mcp-oauth";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { mcpServerPublicUrl } from "@/lib/mcp-resource";
import { SettingsNav } from "../settings-nav";
import { McpConnectionsClient } from "./mcp-connections-client";
import { PersonalTokensClient } from "./personal-tokens-client";

export default async function McpConnectionsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const allConnections = await listActiveConnections(prisma, { userId: session.user.id });
  const connections = allConnections.filter(
    (connection) => connection.organisationId === organisation.organisationId,
  );
  const personalTokens = await listPersonalTokens(prisma, {
    userId: session.user.id,
    organisationId: organisation.organisationId,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="MCP connections"
        description="Applications you've connected (like Claude) that can act on this organisation on your behalf, scoped to the permissions you granted."
      />
      <SettingsNav />
      <McpConnectionsClient
        organisationId={organisation.organisationId}
        connections={connections.map((connection) => ({
          clientId: connection.clientId,
          clientName: connection.clientName,
          scope: connection.scope,
          createdAt: connection.createdAt.toISOString(),
        }))}
      />
      <PersonalTokensClient
        organisationId={organisation.organisationId}
        mcpUrl={`${mcpServerPublicUrl().replace(/\/$/, "")}/mcp`}
        tokens={personalTokens.map((token) => ({
          id: token.id,
          name: token.name,
          scope: token.scope,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
