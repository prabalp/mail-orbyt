import { resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  buildSocialUserPrompt,
  computeCompositeConfidence,
  generateSocialContent,
  getAiSocialGenerator,
  isAiConfigured,
  validateSocialContent,
  type SocialActionKind as GenerationActionKind,
} from "@mail-orbyt/social-generation";
import { evaluateSocialAction } from "@mail-orbyt/social-policy";
import type { Redis } from "ioredis";
import {
  SOCIAL_EVENT_PROCESSING_QUEUE_NAME,
  type SocialEventProcessingJobData,
  enqueueSocialPublishJob,
} from "@mail-orbyt/social-scheduling";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import { computeSentiment } from "./social-sentiment.js";

const EVENT_TYPE_TO_ACTION_KIND: Record<string, GenerationActionKind> = {
  MENTION: "REPLY",
  COMMENT: "REPLY",
  DM: "DM_REPLY",
  KEYWORD_MATCH: "REPLY",
};

/**
 * Consumes a SocialInboundEvent (from either the poll worker or, later, a
 * Meta webhook route), drafts a reply through @mail-orbyt/social-generation,
 * runs it through validation to get a composite confidence, and hands the
 * result to @mail-orbyt/social-policy's evaluateSocialAction — the single
 * point that decides ALLOW / ESCALATE / DENY and persists the audit record.
 * Only an ALLOW (autonomy on, dry-run off) goes on to the publish queue;
 * everything else is already terminal or awaiting human review.
 */
export function createSocialEventProcessingWorker(params: {
  connection: ConnectionOptions;
  redis: Redis;
  prisma: PrismaClient;
  logger: Logger;
}): Worker<SocialEventProcessingJobData> {
  const worker = new Worker<SocialEventProcessingJobData>(
    SOCIAL_EVENT_PROCESSING_QUEUE_NAME,
    async (job: Job<SocialEventProcessingJobData>) => {
      const event = await params.prisma.socialInboundEvent.findUniqueOrThrow({
        where: { id: job.data.socialInboundEventId },
        include: { connection: true },
      });

      if (event.processedAt !== null) return; // already handled by a prior attempt

      const aiConfig = await resolveOrgAiConfig(params.prisma, event.organisationId);
      if (!isAiConfigured(aiConfig)) {
        params.logger.warn("skipping social event: no AI provider configured for organisation", {
          organisationId: event.organisationId,
          eventId: event.id,
        });
        await params.prisma.socialInboundEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        return;
      }

      const actionKind = EVENT_TYPE_TO_ACTION_KIND[event.eventType] ?? "REPLY";
      const generator = getAiSocialGenerator(aiConfig);

      const recentEscalatedPhrases = await params.prisma.socialAction.findMany({
        where: { organisationId: event.organisationId, status: "REJECTED_BY_HUMAN" },
        select: { generatedContent: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      const generationInput = {
        platform: event.platform,
        actionKind,
        triggerContentText: event.contentText,
      };
      const generated = await generateSocialContent(generator, generationInput);

      const validation = validateSocialContent(
        generated.content,
        { platform: event.platform, actionKind },
        recentEscalatedPhrases.map((row) => row.generatedContent),
      );
      const compositeConfidence = computeCompositeConfidence(
        generated.modelSelfReportedConfidence,
        validation,
      );

      const result = await evaluateSocialAction(params.prisma, params.redis, {
        organisationId: event.organisationId,
        connectionId: event.connectionId,
        platform: event.platform,
        actionType: actionKind,
        content: validation.fixedContent,
        compositeConfidence,
        isFirstTimeContact: event.authorIsFirstTimeContact,
        sentiment: computeSentiment(event.contentText),
        triggerEventId: event.id,
        triggerSource: "poll",
        generationPrompt: buildSocialUserPrompt(generationInput),
        generationModel: aiConfig.model ?? "default",
      });

      await params.prisma.socialInboundEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      if (result.decision === "ALLOW") {
        await enqueueSocialPublishJob(params.connection, { socialActionId: result.actionId });
      }

      params.logger.info("social event processed", {
        eventId: event.id,
        actionId: result.actionId,
        decision: result.decision,
      });
    },
    { connection: params.connection, concurrency: 2 },
  );

  worker.on("failed", (job, error) => {
    params.logger.error("social event processing failed", {
      jobId: job?.id,
      eventId: job?.data.socialInboundEventId,
      error,
    });
  });

  return worker;
}
