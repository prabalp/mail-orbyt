-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('LINKEDIN', 'TWITTER', 'REDDIT', 'INSTAGRAM', 'THREADS');

-- CreateEnum
CREATE TYPE "SocialConnectionStatus" AS ENUM ('CONNECTED', 'TOKEN_EXPIRED', 'REVOKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SocialPolicyRuleKind" AS ENUM ('BANNED_TOPIC', 'BANNED_PHRASE', 'ALLOWED_TOPIC', 'REQUIRE_APPROVAL_KEYWORD');

-- CreateEnum
CREATE TYPE "SocialEventType" AS ENUM ('MENTION', 'COMMENT', 'DM', 'KEYWORD_MATCH');

-- CreateEnum
CREATE TYPE "SocialActionType" AS ENUM ('POST', 'REPLY', 'DM_REPLY', 'LIKE');

-- CreateEnum
CREATE TYPE "SocialActionStatus" AS ENUM ('PENDING_POLICY_CHECK', 'PENDING_HUMAN_APPROVAL', 'APPROVED', 'REJECTED_BY_POLICY', 'REJECTED_BY_HUMAN', 'DRY_RUN_SIMULATED', 'PUBLISHED', 'FAILED', 'KILLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_CONNECTION_ADDED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_CONNECTION_REMOVED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_KILL_SWITCH_ACTIVATED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_KILL_SWITCH_DEACTIVATED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_ACTION_PUBLISHED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_ACTION_ESCALATED';
ALTER TYPE "AuditEventType" ADD VALUE 'SOCIAL_POLICY_RULE_CHANGED';

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalHandle" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedByUserId" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAutonomyConfig" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "platform" "SocialPlatform",
    "autonomyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dryRunMode" BOOLEAN NOT NULL DEFAULT true,
    "killSwitchActivatedAt" TIMESTAMP(3),
    "killSwitchActivatedByUserId" TEXT,
    "maxActionsPerHour" INTEGER NOT NULL DEFAULT 5,
    "maxActionsPerDay" INTEGER NOT NULL DEFAULT 20,
    "requireApprovalBelowConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAutonomyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPolicyRule" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "SocialPolicyRuleKind" NOT NULL,
    "pattern" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT false,
    "platform" "SocialPlatform",
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialInboundEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "eventType" "SocialEventType" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalThreadId" TEXT,
    "authorHandle" TEXT NOT NULL,
    "authorIsFirstTimeContact" BOOLEAN NOT NULL DEFAULT false,
    "contentText" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAction" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "actionType" "SocialActionType" NOT NULL,
    "status" "SocialActionStatus" NOT NULL DEFAULT 'PENDING_POLICY_CHECK',
    "triggerEventId" TEXT,
    "triggerSource" TEXT NOT NULL,
    "generatedContent" TEXT NOT NULL,
    "generationPrompt" TEXT NOT NULL,
    "generationModel" TEXT NOT NULL,
    "policyConfidence" DOUBLE PRECISION,
    "policyEvaluation" JSONB NOT NULL,
    "policyDecision" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "externalPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialConnection_organisationId_idx" ON "SocialConnection"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_organisationId_platform_externalAccountId_key" ON "SocialConnection"("organisationId", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAutonomyConfig_organisationId_platform_key" ON "SocialAutonomyConfig"("organisationId", "platform");

-- CreateIndex
CREATE INDEX "SocialPolicyRule_organisationId_idx" ON "SocialPolicyRule"("organisationId");

-- CreateIndex
CREATE INDEX "SocialInboundEvent_organisationId_processedAt_idx" ON "SocialInboundEvent"("organisationId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialInboundEvent_connectionId_externalEventId_key" ON "SocialInboundEvent"("connectionId", "externalEventId");

-- CreateIndex
CREATE INDEX "SocialAction_organisationId_createdAt_idx" ON "SocialAction"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialAction_connectionId_createdAt_idx" ON "SocialAction"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialAction_status_idx" ON "SocialAction"("status");

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAutonomyConfig" ADD CONSTRAINT "SocialAutonomyConfig_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPolicyRule" ADD CONSTRAINT "SocialPolicyRule_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialInboundEvent" ADD CONSTRAINT "SocialInboundEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialInboundEvent" ADD CONSTRAINT "SocialInboundEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAction" ADD CONSTRAINT "SocialAction_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAction" ADD CONSTRAINT "SocialAction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAction" ADD CONSTRAINT "SocialAction_triggerEventId_fkey" FOREIGN KEY ("triggerEventId") REFERENCES "SocialInboundEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
