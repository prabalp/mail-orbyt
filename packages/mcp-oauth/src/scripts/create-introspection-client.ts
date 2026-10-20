/**
 * Mints a confidential client for RFC 7662 introspection and prints its
 * credentials ONCE (only a hash is stored). Usage:
 *
 *   pnpm --filter @mail-orbyt/mcp-oauth run create-introspection-client -- "orbyt-gateway"
 *
 * Needs DATABASE_URL in the environment (falls back to the repo-root .env).
 */
import { prisma } from "@mail-orbyt/database";
import { createIntrospectionClient } from "../introspection-client";

try {
  process.loadEnvFile(new URL("../../../../.env", import.meta.url));
} catch {
  // No root .env — rely on the ambient environment.
}

const clientName = process.argv
  .slice(2)
  .filter((arg) => arg !== "--")[0]
  ?.trim();
if (!clientName) {
  console.error('Usage: create-introspection-client -- "<name>"');
  process.exit(1);
}

const { clientId, clientSecret } = await createIntrospectionClient(prisma, { clientName });
console.log(`Introspection client created: ${clientName}`);
console.log(`  client_id:     ${clientId}`);
console.log(`  client_secret: ${clientSecret}`);
console.log("Store the secret now; it cannot be shown again.");
await prisma.$disconnect();
