-- CreateEnum
CREATE TYPE "CampaignContentSource" AS ENUM ('AI', 'TEMPLATE', 'IMPORTED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "contentSource" "CampaignContentSource" NOT NULL DEFAULT 'AI';


-- Backfill from what each existing campaign already does.
-- Linear: any imported step -> IMPORTED; steps but none use AI -> TEMPLATE; else AI.
UPDATE "Campaign" c SET "contentSource" = 'IMPORTED'
WHERE c."routingMode" = 'LINEAR'
  AND EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c.id AND s."useImportedContent");

UPDATE "Campaign" c SET "contentSource" = 'TEMPLATE'
WHERE c."routingMode" = 'LINEAR'
  AND c."contentSource" = 'AI'
  AND EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM "CampaignStep" s WHERE s."campaignId" = c.id AND s."useAiGeneration");

-- Journey: a saved graph with any written (non-uploaded) email -> TEMPLATE; otherwise
-- the lead's own uploaded graph is the source -> IMPORTED.
UPDATE "Campaign" c SET "contentSource" = 'IMPORTED'
WHERE c."routingMode" = 'JOURNEY'
  AND (
    c."journeyGraph" IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(c."journeyGraph"->'nodes') n WHERE n->>'importedSequence' IS NULL
    )
  );

UPDATE "Campaign" c SET "contentSource" = 'TEMPLATE'
WHERE c."routingMode" = 'JOURNEY'
  AND c."journeyGraph" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c."journeyGraph"->'nodes') n WHERE n->>'importedSequence' IS NULL
  );
