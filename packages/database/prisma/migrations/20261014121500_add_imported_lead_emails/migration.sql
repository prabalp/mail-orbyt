-- Prewritten per-lead emails imported from CSV, and a campaign-step mode
-- that sends those emails instead of generating or using a shared template.

ALTER TABLE "CampaignStep" ADD COLUMN "useImportedContent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LeadImportedEmail" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "emailType" "SequenceStepType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadImportedEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadImportedEmail_leadId_sequence_key" ON "LeadImportedEmail"("leadId", "sequence");
CREATE INDEX "LeadImportedEmail_leadId_idx" ON "LeadImportedEmail"("leadId");
CREATE INDEX "LeadImportedEmail_organisationId_idx" ON "LeadImportedEmail"("organisationId");

ALTER TABLE "LeadImportedEmail" ADD CONSTRAINT "LeadImportedEmail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
