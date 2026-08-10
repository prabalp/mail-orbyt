-- Re-scope Signature from per-inbox to per-organisation, so one set of
-- signatures is shared across every inbox in an org instead of each inbox
-- keeping its own. Existing rows are backfilled from their inbox's
-- organisationId; since at most one default per org is now allowed (versus
-- previously one default per inbox), any org that ends up with more than one
-- default signature after backfill keeps only its oldest as default.

-- AlterTable
ALTER TABLE "Signature" ADD COLUMN "organisationId" TEXT;

UPDATE "Signature" s
SET "organisationId" = "Inbox"."organisationId"
FROM "Inbox"
WHERE "Inbox"."id" = s."inboxId";

UPDATE "Signature" s
SET "isDefault" = false
WHERE s."isDefault" = true
  AND s."id" NOT IN (
    SELECT DISTINCT ON ("organisationId") "id"
    FROM "Signature"
    WHERE "isDefault" = true
    ORDER BY "organisationId", "createdAt" ASC
  );

ALTER TABLE "Signature" ALTER COLUMN "organisationId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Signature" DROP CONSTRAINT "Signature_inboxId_fkey";

-- DropIndex
DROP INDEX "Signature_inboxId_idx";

ALTER TABLE "Signature" DROP COLUMN "inboxId";

-- CreateIndex
CREATE INDEX "Signature_organisationId_idx" ON "Signature"("organisationId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
