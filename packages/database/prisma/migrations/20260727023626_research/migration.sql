-- CreateEnum
CREATE TYPE "ResearchSubjectType" AS ENUM ('LEAD', 'COMPANY');

-- CreateEnum
CREATE TYPE "ResearchJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchProviderKind" AS ENUM ('WEBSITE', 'SEARCH', 'NEWS', 'RSS', 'ENRICHMENT');

-- CreateEnum
CREATE TYPE "ResearchProviderRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED_NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('JSON_LD', 'OPEN_GRAPH', 'META_TAG', 'REGEX', 'STRUCTURED_ENDPOINT');

-- CreateEnum
CREATE TYPE "ResearchFactStatus" AS ENUM ('OBSERVED', 'USER_CONFIRMED', 'USER_REJECTED', 'EXPIRED', 'CONFLICTED');

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subjectType" "ResearchSubjectType" NOT NULL,
    "leadId" TEXT,
    "companyId" TEXT,
    "status" "ResearchJobStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchProviderRun" (
    "id" TEXT NOT NULL,
    "researchJobId" TEXT NOT NULL,
    "provider" "ResearchProviderKind" NOT NULL,
    "status" "ResearchProviderRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchProviderRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "researchProviderRunId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchDocument" (
    "id" TEXT NOT NULL,
    "researchSourceId" TEXT NOT NULL,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "extractedData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFact" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subjectType" "ResearchSubjectType" NOT NULL,
    "leadId" TEXT,
    "companyId" TEXT,
    "researchJobId" TEXT,
    "researchDocumentId" TEXT,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "sourcePublishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceExcerpt" TEXT,
    "freshnessExpiresAt" TIMESTAMP(3),
    "status" "ResearchFactStatus" NOT NULL DEFAULT 'OBSERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFactEvidence" (
    "id" TEXT NOT NULL,
    "researchFactId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFactEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSnapshot" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "subjectType" "ResearchSubjectType" NOT NULL,
    "leadId" TEXT,
    "companyId" TEXT,
    "facts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchJob_organisationId_idx" ON "ResearchJob"("organisationId");

-- CreateIndex
CREATE INDEX "ResearchJob_organisationId_status_idx" ON "ResearchJob"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ResearchJob_leadId_idx" ON "ResearchJob"("leadId");

-- CreateIndex
CREATE INDEX "ResearchJob_companyId_idx" ON "ResearchJob"("companyId");

-- CreateIndex
CREATE INDEX "ResearchProviderRun_researchJobId_idx" ON "ResearchProviderRun"("researchJobId");

-- CreateIndex
CREATE INDEX "ResearchSource_researchProviderRunId_idx" ON "ResearchSource"("researchProviderRunId");

-- CreateIndex
CREATE INDEX "ResearchSource_url_idx" ON "ResearchSource"("url");

-- CreateIndex
CREATE INDEX "ResearchDocument_researchSourceId_idx" ON "ResearchDocument"("researchSourceId");

-- CreateIndex
CREATE INDEX "ResearchFact_organisationId_idx" ON "ResearchFact"("organisationId");

-- CreateIndex
CREATE INDEX "ResearchFact_leadId_idx" ON "ResearchFact"("leadId");

-- CreateIndex
CREATE INDEX "ResearchFact_companyId_idx" ON "ResearchFact"("companyId");

-- CreateIndex
CREATE INDEX "ResearchFact_organisationId_status_idx" ON "ResearchFact"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ResearchFact_category_idx" ON "ResearchFact"("category");

-- CreateIndex
CREATE INDEX "ResearchFactEvidence_researchFactId_idx" ON "ResearchFactEvidence"("researchFactId");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_organisationId_idx" ON "ResearchSnapshot"("organisationId");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_leadId_idx" ON "ResearchSnapshot"("leadId");

-- CreateIndex
CREATE INDEX "ResearchSnapshot_companyId_idx" ON "ResearchSnapshot"("companyId");

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchProviderRun" ADD CONSTRAINT "ResearchProviderRun_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_researchProviderRunId_fkey" FOREIGN KEY ("researchProviderRunId") REFERENCES "ResearchProviderRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchDocument" ADD CONSTRAINT "ResearchDocument_researchSourceId_fkey" FOREIGN KEY ("researchSourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_researchDocumentId_fkey" FOREIGN KEY ("researchDocumentId") REFERENCES "ResearchDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFactEvidence" ADD CONSTRAINT "ResearchFactEvidence_researchFactId_fkey" FOREIGN KEY ("researchFactId") REFERENCES "ResearchFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
