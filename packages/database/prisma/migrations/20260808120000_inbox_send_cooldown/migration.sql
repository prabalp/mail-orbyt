-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "inboxCooldownMinutes" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Inbox" ADD COLUMN     "sendCooldownUntil" TIMESTAMP(3);
