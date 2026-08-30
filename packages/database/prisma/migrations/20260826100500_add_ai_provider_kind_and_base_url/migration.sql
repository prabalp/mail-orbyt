-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('GEMINI', 'OPENAI_COMPATIBLE');

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "aiProviderBaseUrl" TEXT,
ADD COLUMN     "aiProviderKind" "AiProviderKind" NOT NULL DEFAULT 'GEMINI';
