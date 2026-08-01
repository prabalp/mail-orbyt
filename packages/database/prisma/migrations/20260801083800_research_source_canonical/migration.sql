-- ResearchSource becomes a stable, continuously-updated row per
-- (organisation, subject, url) instead of one row per research run. This
-- migration adds the new identity columns, backfills them from the existing
-- researchProviderRunId -> ResearchProviderRun -> ResearchJob chain,
-- consolidates any pre-existing duplicate sources for the same subject+url
-- into the most recently fetched one, then locks in the new constraints.

-- Step 1: add new columns as nullable so existing rows can be backfilled.
ALTER TABLE "ResearchSource"
  ADD COLUMN "organisationId" TEXT,
  ADD COLUMN "subjectType" "ResearchSubjectType",
  ADD COLUMN "leadId" TEXT,
  ADD COLUMN "companyId" TEXT;

-- Step 2: backfill from the run that originally created each source.
UPDATE "ResearchSource" rs
SET "organisationId" = rj."organisationId",
    "subjectType" = rj."subjectType",
    "leadId" = rj."leadId",
    "companyId" = rj."companyId"
FROM "ResearchProviderRun" rpr
JOIN "ResearchJob" rj ON rpr."researchJobId" = rj.id
WHERE rs."researchProviderRunId" = rpr.id;

-- Step 3: consolidate duplicates. For each (organisationId, subjectType,
-- leadId, companyId, url) group, keep only the most recently fetched row.
-- Keyword-extraction history on the rows being dropped is preserved by
-- reassigning it to the surviving row first; ResearchPageText/
-- ResearchDocument on dropped rows are cascade-deleted (the survivor already
-- has its own, more recent copies), and any ResearchFact.researchDocumentId
-- pointing at a dropped row's document is set NULL by that FK's existing
-- ON DELETE SET NULL behavior — the fact itself (its category/value/source
-- URL) is untouched.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "organisationId", "subjectType", COALESCE("leadId", ''), COALESCE("companyId", ''), url
      ORDER BY "fetchedAt" DESC, id DESC
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY "organisationId", "subjectType", COALESCE("leadId", ''), COALESCE("companyId", ''), url
      ORDER BY "fetchedAt" DESC, id DESC
    ) AS winner_id
  FROM "ResearchSource"
)
UPDATE "ResearchKeywordRun" rkr
SET "researchSourceId" = ranked.winner_id
FROM ranked
WHERE rkr."researchSourceId" = ranked.id AND ranked.rn > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "organisationId", "subjectType", COALESCE("leadId", ''), COALESCE("companyId", ''), url
      ORDER BY "fetchedAt" DESC, id DESC
    ) AS rn
  FROM "ResearchSource"
)
DELETE FROM "ResearchSource" WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 4: every remaining row now has organisationId/subjectType populated.
ALTER TABLE "ResearchSource"
  ALTER COLUMN "organisationId" SET NOT NULL,
  ALTER COLUMN "subjectType" SET NOT NULL;

-- Step 5: researchProviderRunId is now "last run that touched this row",
-- not an owning parent — optional, and SET NULL (not CASCADE) on delete.
ALTER TABLE "ResearchSource" DROP CONSTRAINT "ResearchSource_researchProviderRunId_fkey";
ALTER TABLE "ResearchSource" ALTER COLUMN "researchProviderRunId" DROP NOT NULL;
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_researchProviderRunId_fkey"
  FOREIGN KEY ("researchProviderRunId") REFERENCES "ResearchProviderRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 6: new identity FKs, cascading from Organisation/Lead/Company directly
-- so a ResearchSource outlives any single job/provider run.
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: indexes for the new identity columns.
CREATE INDEX "ResearchSource_organisationId_idx" ON "ResearchSource"("organisationId");
CREATE INDEX "ResearchSource_leadId_idx" ON "ResearchSource"("leadId");
CREATE INDEX "ResearchSource_companyId_idx" ON "ResearchSource"("companyId");

-- Step 8: ResearchDocument becomes 1:1 with ResearchSource (safe post-
-- consolidation — every source has at most one document already).
CREATE UNIQUE INDEX "ResearchDocument_researchSourceId_key" ON "ResearchDocument"("researchSourceId");
