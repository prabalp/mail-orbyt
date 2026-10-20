-- CreateEnum
CREATE TYPE "CampaignRoutingMode" AS ENUM ('LINEAR', 'JOURNEY');

-- DropIndex
DROP INDEX "OutboxItem_campaignId_leadId_campaignStepId_key";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "routingMode" "CampaignRoutingMode" NOT NULL DEFAULT 'LINEAR';

-- AlterTable
ALTER TABLE "LeadImportedEmail" ADD COLUMN     "edges" JSONB,
ADD COLUMN     "isStart" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nodeKey" TEXT;

-- AlterTable
ALTER TABLE "CampaignEnrollment" ADD COLUMN     "currentNodeKey" TEXT,
ADD COLUMN     "nextDecisionAt" TIMESTAMP(3),
ADD COLUMN     "nextDueAt" TIMESTAMP(3),
ADD COLUMN     "nextNodeKey" TEXT,
ADD COLUMN     "sendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visitCounts" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "OutboxItem" ADD COLUMN     "nodeKey" TEXT,
ADD COLUMN     "sendNo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EnrollmentRoutingDecision" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "fromNodeKey" TEXT,
    "trigger" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "toNodeKey" TEXT,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentRoutingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentRoutingDecision_enrollmentId_idx" ON "EnrollmentRoutingDecision"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportedEmail_leadId_nodeKey_key" ON "LeadImportedEmail"("leadId", "nodeKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxItem_campaignId_leadId_campaignStepId_sendNo_key" ON "OutboxItem"("campaignId", "leadId", "campaignStepId", "sendNo");

-- AddForeignKey
ALTER TABLE "EnrollmentRoutingDecision" ADD CONSTRAINT "EnrollmentRoutingDecision_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CampaignEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

