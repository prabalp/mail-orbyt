-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('MANUAL', 'CSV_IMPORT', 'RESEARCH_PROVIDER');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DuplicateStrategy" AS ENUM ('SKIP', 'UPDATE_BLANKS', 'OVERWRITE', 'REJECT', 'ALLOW_SEPARATE');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'IMPORTED', 'UPDATED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "SuppressionType" AS ENUM ('EMAIL', 'DOMAIN');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('HARD_BOUNCE', 'UNSUBSCRIBE', 'MANUAL_DO_NOT_CONTACT', 'INVALID_EMAIL', 'CUSTOMER', 'ACTIVE_OPPORTUNITY');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "DataSourceKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "websiteUrl" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "fieldSources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "title" TEXT,
    "linkedinUrl" TEXT,
    "websiteUrl" TEXT,
    "industry" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'ACTIVE',
    "companyId" TEXT,
    "fieldSources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCompany" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadList" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadListMembership" (
    "id" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadListMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "duplicateStrategy" "DuplicateStrategy" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "type" "SuppressionType" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "createdByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE INDEX "DataSource_kind_idx" ON "DataSource"("kind");

-- CreateIndex
CREATE INDEX "Company_organisationId_idx" ON "Company"("organisationId");

-- CreateIndex
CREATE INDEX "Company_organisationId_name_idx" ON "Company"("organisationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_organisationId_domain_key" ON "Company"("organisationId", "domain");

-- CreateIndex
CREATE INDEX "Lead_organisationId_idx" ON "Lead"("organisationId");

-- CreateIndex
CREATE INDEX "Lead_organisationId_status_idx" ON "Lead"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organisationId_companyId_idx" ON "Lead"("organisationId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organisationId_email_key" ON "Lead"("organisationId", "email");

-- CreateIndex
CREATE INDEX "LeadCompany_leadId_idx" ON "LeadCompany"("leadId");

-- CreateIndex
CREATE INDEX "LeadCompany_companyId_idx" ON "LeadCompany"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCompany_leadId_companyId_key" ON "LeadCompany"("leadId", "companyId");

-- CreateIndex
CREATE INDEX "LeadList_organisationId_idx" ON "LeadList"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadList_organisationId_name_key" ON "LeadList"("organisationId", "name");

-- CreateIndex
CREATE INDEX "LeadListMembership_leadListId_idx" ON "LeadListMembership"("leadListId");

-- CreateIndex
CREATE INDEX "LeadListMembership_leadId_idx" ON "LeadListMembership"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadListMembership_leadListId_leadId_key" ON "LeadListMembership"("leadListId", "leadId");

-- CreateIndex
CREATE INDEX "ImportBatch_organisationId_idx" ON "ImportBatch"("organisationId");

-- CreateIndex
CREATE INDEX "ImportBatch_organisationId_status_idx" ON "ImportBatch"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_importBatchId_idx" ON "ImportRow"("importBatchId");

-- CreateIndex
CREATE INDEX "ImportRow_importBatchId_status_idx" ON "ImportRow"("importBatchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importBatchId_rowNumber_key" ON "ImportRow"("importBatchId", "rowNumber");

-- CreateIndex
CREATE INDEX "SuppressionEntry_organisationId_idx" ON "SuppressionEntry"("organisationId");

-- CreateIndex
CREATE INDEX "SuppressionEntry_organisationId_type_idx" ON "SuppressionEntry"("organisationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_organisationId_type_value_key" ON "SuppressionEntry"("organisationId", "type", "value");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCompany" ADD CONSTRAINT "LeadCompany_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCompany" ADD CONSTRAINT "LeadCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListMembership" ADD CONSTRAINT "LeadListMembership_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListMembership" ADD CONSTRAINT "LeadListMembership_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
