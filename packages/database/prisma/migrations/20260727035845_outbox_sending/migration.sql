-- CreateEnum
CREATE TYPE "OutboxItemStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED_SUPPRESSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CampaignEnrollment" ADD COLUMN     "lastStepSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OutboxItem" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignStepId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "OutboxItemStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "inboxId" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxItem_organisationId_idx" ON "OutboxItem"("organisationId");

-- CreateIndex
CREATE INDEX "OutboxItem_status_scheduledFor_idx" ON "OutboxItem"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "OutboxItem_inboxId_idx" ON "OutboxItem"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxItem_campaignId_leadId_campaignStepId_key" ON "OutboxItem"("campaignId", "leadId", "campaignStepId");

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_campaignStepId_fkey" FOREIGN KEY ("campaignStepId") REFERENCES "CampaignStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CampaignEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxItem" ADD CONSTRAINT "OutboxItem_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
