-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "generationSystemPrompt" TEXT,
ADD COLUMN     "reviewSystemPrompt" TEXT,
ADD COLUMN     "rewriteSystemPrompt" TEXT;
