/**
 * Idempotently registers the McpResource rows (mail-orbyt, lead-orbyt, and
 * the gateway from GATEWAY_RESOURCE_URI). Usage:
 *
 *   pnpm --filter @mail-orbyt/mcp-oauth run seed-mcp-resources
 */
import { prisma } from "@mail-orbyt/database";
import { ensureMcpResources } from "../resources";

try {
  process.loadEnvFile(new URL("../../../../.env", import.meta.url));
} catch {
  // No root .env — rely on the ambient environment.
}

const registered = await ensureMcpResources(prisma, {
  gatewayResourceUri: process.env.GATEWAY_RESOURCE_URI || undefined,
});
console.log(`Registered resources: ${registered.join(", ")}`);
if (!process.env.GATEWAY_RESOURCE_URI)
  console.log("GATEWAY_RESOURCE_URI unset: gateway not registered.");
await prisma.$disconnect();
