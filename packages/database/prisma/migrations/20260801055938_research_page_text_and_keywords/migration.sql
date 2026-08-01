-- CreateEnum
CREATE TYPE "KeywordExtractionMode" AS ENUM ('DETERMINISTIC', 'AI');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExtractionMethod" ADD VALUE 'KEYWORD_FREQUENCY';
ALTER TYPE "ExtractionMethod" ADD VALUE 'AI_KEYWORD';

-- CreateTable
CREATE TABLE "ResearchPageText" (
    "id" TEXT NOT NULL,
    "researchSourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchPageText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchKeywordRun" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "researchSourceId" TEXT NOT NULL,
    "mode" "KeywordExtractionMode" NOT NULL,
    "status" "ResearchProviderRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchKeywordRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchPageText_researchSourceId_key" ON "ResearchPageText"("researchSourceId");

-- CreateIndex
CREATE INDEX "ResearchKeywordRun_researchSourceId_idx" ON "ResearchKeywordRun"("researchSourceId");

-- CreateIndex
CREATE INDEX "ResearchKeywordRun_organisationId_idx" ON "ResearchKeywordRun"("organisationId");

-- AddForeignKey
ALTER TABLE "ResearchPageText" ADD CONSTRAINT "ResearchPageText_researchSourceId_fkey" FOREIGN KEY ("researchSourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchKeywordRun" ADD CONSTRAINT "ResearchKeywordRun_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchKeywordRun" ADD CONSTRAINT "ResearchKeywordRun_researchSourceId_fkey" FOREIGN KEY ("researchSourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
