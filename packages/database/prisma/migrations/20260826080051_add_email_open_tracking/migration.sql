-- CreateEnum
CREATE TYPE "TrackingDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "OutboxItem" ADD COLUMN     "firstOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrackingDomain" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "status" "TrackingDomainStatus" NOT NULL DEFAULT 'PENDING',
    "lastCheckedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOpenEvent" (
    "id" TEXT NOT NULL,
    "outboxItemId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOpenEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingDomain_organisationId_key" ON "TrackingDomain"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingDomain_domain_key" ON "TrackingDomain"("domain");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_outboxItemId_idx" ON "EmailOpenEvent"("outboxItemId");

-- CreateIndex
CREATE INDEX "EmailOpenEvent_organisationId_occurredAt_idx" ON "EmailOpenEvent"("organisationId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TrackingDomain" ADD CONSTRAINT "TrackingDomain_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOpenEvent" ADD CONSTRAINT "EmailOpenEvent_outboxItemId_fkey" FOREIGN KEY ("outboxItemId") REFERENCES "OutboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
