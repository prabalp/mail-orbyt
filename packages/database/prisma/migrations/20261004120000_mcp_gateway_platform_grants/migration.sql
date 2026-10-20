-- AlterTable
ALTER TABLE "McpAuthorizationCode" ADD COLUMN     "platformGrantId" TEXT,
ADD COLUMN     "resource" TEXT NOT NULL DEFAULT 'urn:orbyt:mail-orbyt-mcp-server';

-- AlterTable
ALTER TABLE "McpAccessToken" ADD COLUMN     "platformGrantId" TEXT,
ADD COLUMN     "resource" TEXT NOT NULL DEFAULT 'urn:orbyt:mail-orbyt-mcp-server';

-- AlterTable
ALTER TABLE "McpRefreshToken" ADD COLUMN     "platformGrantId" TEXT,
ADD COLUMN     "resource" TEXT NOT NULL DEFAULT 'urn:orbyt:mail-orbyt-mcp-server';

-- CreateTable
CREATE TABLE "McpPlatformGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpPlatformGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpResource" (
    "id" TEXT NOT NULL,
    "resourceUri" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scopeMapping" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpIntrospectionClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpIntrospectionClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpPlatformGrant_userId_clientId_idx" ON "McpPlatformGrant"("userId", "clientId");

-- CreateIndex
CREATE INDEX "McpPlatformGrant_organisationId_idx" ON "McpPlatformGrant"("organisationId");

-- CreateIndex
CREATE INDEX "McpPlatformGrant_clientId_idx" ON "McpPlatformGrant"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpResource_resourceUri_key" ON "McpResource"("resourceUri");

-- CreateIndex
CREATE UNIQUE INDEX "McpIntrospectionClient_clientId_key" ON "McpIntrospectionClient"("clientId");

-- AddForeignKey
ALTER TABLE "McpAccessToken" ADD CONSTRAINT "McpAccessToken_platformGrantId_fkey" FOREIGN KEY ("platformGrantId") REFERENCES "McpPlatformGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpRefreshToken" ADD CONSTRAINT "McpRefreshToken_platformGrantId_fkey" FOREIGN KEY ("platformGrantId") REFERENCES "McpPlatformGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing McpAuthorizationCode/McpAccessToken/McpRefreshToken rows
-- receive the column DEFAULT above, i.e. mail-orbyt's own mcp-server resource
-- URI, which makes today's implicit audience explicit. The DEFAULT is kept so
-- the previous app version keeps working during a rolling deploy.

-- Seed the resource registry with the two native backends. The gateway's own
-- resource row depends on GATEWAY_RESOURCE_URI (env), so it is upserted by
-- `pnpm --filter @mail-orbyt/mcp-oauth run seed-mcp-resources`, not here.
INSERT INTO "McpResource" ("id", "resourceUri", "name", "kind", "scopeMapping")
VALUES
  ('mcpres_mail_orbyt', 'urn:orbyt:mail-orbyt-mcp-server', 'Mail Orbyt MCP server', 'native-local', '{}'),
  ('mcpres_lead_orbyt', 'urn:orbyt:lead-orbyt-mcp-server', 'Lead Orbyt MCP server', 'native-introspected', '{}')
ON CONFLICT ("resourceUri") DO NOTHING;
