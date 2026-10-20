import { prisma } from "@mail-orbyt/database";
import { createIntrospectionClient } from "../src/introspection-clients";

/**
 * One-off operator script: mints a confidential McpOAuthClient for a
 * server-to-server RFC 7662 introspection caller (currently: lead_orbyt's
 * MCP server) and prints the raw secret exactly once. Deliberately not a
 * public HTTP endpoint — see introspection-clients.ts and ARCHITECTURE.md
 * §6/§7. Run with:
 *
 *   pnpm --filter @mail-orbyt/mcp-oauth run create-introspection-client -- "lead_orbyt"
 *
 * then hand the printed client_id/client_secret to that backend's own
 * configuration out of band (env vars, secret manager, ...) — never commit
 * them anywhere.
 */
async function main(): Promise<void> {
  const clientName = process.argv[2];
  if (!clientName) {
    console.error("Usage: create-introspection-client <client-name>");
    process.exit(1);
  }

  const { clientId, clientSecret } = await createIntrospectionClient(prisma, { clientName });

  console.log(`Created introspection client "${clientName}":\n`);
  console.log(`  client_id:     ${clientId}`);
  console.log(`  client_secret: ${clientSecret}\n`);
  console.log("This secret is shown once and cannot be recovered — store it now.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
