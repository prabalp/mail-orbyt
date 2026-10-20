-- ARCHITECTURE.md §6: RFC 8707 resource/audience column on every MCP token
-- table, the McpPlatformGrant single-consent record, and the McpResource
-- registry of backends the token-exchange grant (RFC 8693) may mint
-- resource-scoped tokens for.
--
-- Existing rows predate the resource indicator entirely — every token ever
-- issued so far implicitly targeted mail-orbyt's own MCP resource server,
-- so they backfill to that resource's logical identifier (see
-- packages/mcp-oauth/src/constants.ts, MAIL_ORBYT_MCP_RESOURCE_URI). Added
-- nullable, backfilled, then tightened to NOT NULL so this works regardless
-- of how many rows already exist.

-- CreateEnum
CREATE TYPE "McpResourceBackendKind" AS ENUM ('NATIVE_LOCAL', 'NATIVE_INTROSPECTED');

-- AlterTable: McpAuthorizationCode
ALTER TABLE "McpAuthorizationCode" ADD COLUMN "resource" TEXT;
UPDATE "McpAuthorizationCode" SET "resource" = 'urn:orbyt:mail-orbyt-mcp-server' WHERE "resource" IS NULL;
ALTER TABLE "McpAuthorizationCode" ALTER COLUMN "resource" SET NOT NULL;

-- AlterTable: McpAccessToken
ALTER TABLE "McpAccessToken" ADD COLUMN "platformGrantId" TEXT;
ALTER TABLE "McpAccessToken" ADD COLUMN "resource" TEXT;
UPDATE "McpAccessToken" SET "resource" = 'urn:orbyt:mail-orbyt-mcp-server' WHERE "resource" IS NULL;
ALTER TABLE "McpAccessToken" ALTER COLUMN "resource" SET NOT NULL;

-- AlterTable: McpRefreshToken
ALTER TABLE "McpRefreshToken" ADD COLUMN "platformGrantId" TEXT;
ALTER TABLE "McpRefreshToken" ADD COLUMN "resource" TEXT;
UPDATE "McpRefreshToken" SET "resource" = 'urn:orbyt:mail-orbyt-mcp-server' WHERE "resource" IS NULL;
ALTER TABLE "McpRefreshToken" ALTER COLUMN "resource" SET NOT NULL;

-- AlterTable: McpOAuthClient — nullable, no backfill needed (every existing
-- client remains a public/PKCE client with no secret).
ALTER TABLE "McpOAuthClient" ADD COLUMN "clientSecretHash" TEXT;

-- CreateTable
CREATE TABLE "McpPlatformGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpPlatformGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpResource" (
    "id" TEXT NOT NULL,
    "resourceUri" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "backendKind" "McpResourceBackendKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "McpPlatformGrant_organisationId_idx" ON "McpPlatformGrant"("organisationId");

-- CreateIndex
CREATE INDEX "McpPlatformGrant_clientId_idx" ON "McpPlatformGrant"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpPlatformGrant_userId_organisationId_clientId_key" ON "McpPlatformGrant"("userId", "organisationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpResource_resourceUri_key" ON "McpResource"("resourceUri");

-- CreateIndex
CREATE INDEX "McpAccessToken_platformGrantId_idx" ON "McpAccessToken"("platformGrantId");

-- CreateIndex
CREATE INDEX "McpRefreshToken_platformGrantId_idx" ON "McpRefreshToken"("platformGrantId");

-- AddForeignKey
ALTER TABLE "McpAccessToken" ADD CONSTRAINT "McpAccessToken_platformGrantId_fkey" FOREIGN KEY ("platformGrantId") REFERENCES "McpPlatformGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpRefreshToken" ADD CONSTRAINT "McpRefreshToken_platformGrantId_fkey" FOREIGN KEY ("platformGrantId") REFERENCES "McpPlatformGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpPlatformGrant" ADD CONSTRAINT "McpPlatformGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the resource registry (ARCHITECTURE.md §5/§6): the two backends the
-- token-exchange grant may mint resource-scoped tokens for today. The
-- Gateway's own resource identity is deliberately NOT a row here — it's
-- whatever a client requests for itself at /oauth/authorize, not something
-- this AS mints exchanged tokens *for*. See constants.ts for these literal
-- URIs — they must match exactly, including the mail-orbyt one already
-- backfilled onto existing tokens above.
INSERT INTO "McpResource" ("id", "resourceUri", "displayName", "backendKind", "createdAt", "updatedAt") VALUES
    ('mcpres_mail_orbyt_mcp_server', 'urn:orbyt:mail-orbyt-mcp-server', 'Mail Orbyt', 'NATIVE_LOCAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('mcpres_lead_orbyt_mcp_server', 'urn:orbyt:lead-orbyt-mcp-server', 'Lead Orbyt', 'NATIVE_INTROSPECTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
