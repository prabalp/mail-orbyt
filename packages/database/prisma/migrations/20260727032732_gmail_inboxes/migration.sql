-- CreateEnum
CREATE TYPE "InboxProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DnsCheckStatus" AS ENUM ('PASS', 'FAIL', 'MISSING', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" "InboxProvider" NOT NULL DEFAULT 'GOOGLE',
    "status" "InboxStatus" NOT NULL DEFAULT 'CONNECTED',
    "dailySendLimit" INTEGER NOT NULL DEFAULT 30,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainDnsCheck" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "spfStatus" "DnsCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "spfRecord" TEXT,
    "dkimSelector" TEXT,
    "dkimStatus" "DnsCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dkimRecord" TEXT,
    "dmarcStatus" "DnsCheckStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dmarcRecord" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainDnsCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inbox_organisationId_idx" ON "Inbox"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Inbox_organisationId_emailAddress_key" ON "Inbox"("organisationId", "emailAddress");

-- CreateIndex
CREATE INDEX "DomainDnsCheck_organisationId_idx" ON "DomainDnsCheck"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainDnsCheck_organisationId_domain_key" ON "DomainDnsCheck"("organisationId", "domain");

-- AddForeignKey
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainDnsCheck" ADD CONSTRAINT "DomainDnsCheck_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
