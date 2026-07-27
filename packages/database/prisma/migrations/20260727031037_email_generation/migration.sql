-- CreateEnum
CREATE TYPE "EmailGenerationType" AS ENUM ('INITIAL', 'FOLLOW_UP', 'CLOSE_THE_LOOP');

-- CreateEnum
CREATE TYPE "EmailRewriteStyle" AS ENUM ('SHORTER', 'FORMAL', 'DIRECT');

-- CreateEnum
CREATE TYPE "EmailDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'DISCARDED');

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "generationType" "EmailGenerationType" NOT NULL,
    "rewriteStyle" "EmailRewriteStyle",
    "basedOnDraftId" TEXT,
    "researchSnapshotId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "status" "EmailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailDraft_organisationId_idx" ON "EmailDraft"("organisationId");

-- CreateIndex
CREATE INDEX "EmailDraft_leadId_idx" ON "EmailDraft"("leadId");

-- CreateIndex
CREATE INDEX "EmailDraft_basedOnDraftId_idx" ON "EmailDraft"("basedOnDraftId");

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_basedOnDraftId_fkey" FOREIGN KEY ("basedOnDraftId") REFERENCES "EmailDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_researchSnapshotId_fkey" FOREIGN KEY ("researchSnapshotId") REFERENCES "ResearchSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
