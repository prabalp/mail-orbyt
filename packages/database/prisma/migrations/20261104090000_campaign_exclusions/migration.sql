-- CreateTable
CREATE TABLE "CampaignExclusion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignExclusion_organisationId_idx" ON "CampaignExclusion"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignExclusion_campaignId_email_key" ON "CampaignExclusion"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "CampaignExclusion" ADD CONSTRAINT "CampaignExclusion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
