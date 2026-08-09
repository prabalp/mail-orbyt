-- AlterTable
ALTER TABLE "LeadList" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "leadListId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "emailPromptInstructions" TEXT;

-- CreateIndex
CREATE INDEX "ImportBatch_leadListId_idx" ON "ImportBatch"("leadListId");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
