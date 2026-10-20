import type { PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  buildSocialAdapterConfigFromEnv,
  getAdapterForPlatform,
  getValidAccessToken,
} from "@mail-orbyt/social-platforms";
import {
  checkAndThrowIfKilled,
  KillSwitchActiveError,
  loadEffectiveAutonomyConfig,
  reserveRateLimit,
} from "@mail-orbyt/social-policy";
import {
  SOCIAL_PUBLISH_QUEUE_NAME,
  type SocialPublishJobData,
} from "@mail-orbyt/social-scheduling";
import { Worker, type ConnectionOptions, type Job } from "bullmq";
import type { Redis } from "ioredis";

export class RateLimitExceededError extends Error {
  constructor(public readonly socialActionId: string) {
    super(`Rate limit exceeded for social action ${socialActionId}.`);
    this.name = "RateLimitExceededError";
  }
}

/**
 * The only place in the codebase that calls a platform adapter's
 * publishPost/publishReply. Every check that can stop a post from going out
 * — the kill switch and the rate limit — is re-verified HERE, synchronously,
 * immediately before the network call, not just once when the action was
 * decided (packages/social-policy's evaluateSocialAction) or when this job
 * was enqueued. A job can sit queued long enough (human-approval wait,
 * retry backoff) for either to have changed since then.
 *
 * A human-approved action (ESCALATE -> APPROVED via the review UI/MCP tool)
 * is enqueued onto this same queue, so it passes through the exact same
 * kill-switch/rate-limit gate as a fully autonomous one — there is no
 * separate, less-guarded path for human-approved actions.
 */
export function createSocialPublishWorker(params: {
  connection: ConnectionOptions;
  redis: Redis;
  prisma: PrismaClient;
  logger: Logger;
}): Worker<SocialPublishJobData> {
  const adapterConfig = buildSocialAdapterConfigFromEnv();

  const worker = new Worker<SocialPublishJobData>(
    SOCIAL_PUBLISH_QUEUE_NAME,
    async (job: Job<SocialPublishJobData>) => {
      const action = await params.prisma.socialAction.findUniqueOrThrow({
        where: { id: job.data.socialActionId },
        include: { triggerEvent: true },
      });

      // Idempotent skip: a job can be retried or re-delivered after the
      // action already reached a terminal state some other way.
      if (action.status !== "APPROVED") return;

      try {
        await checkAndThrowIfKilled(
          params.prisma,
          params.redis,
          action.organisationId,
          action.platform,
        );
      } catch (error) {
        if (error instanceof KillSwitchActiveError) {
          await params.prisma.socialAction.update({
            where: { id: action.id },
            data: { status: "KILLED", failureReason: error.message },
          });
          params.logger.warn("social action killed by kill switch before publish", {
            actionId: action.id,
            organisationId: action.organisationId,
            platform: action.platform,
          });
          return;
        }
        throw error;
      }

      const config = await loadEffectiveAutonomyConfig(
        params.prisma,
        action.organisationId,
        action.platform,
      );
      const rateLimit = await reserveRateLimit(
        params.redis,
        action.organisationId,
        action.platform,
        config.maxActionsPerHour,
        config.maxActionsPerDay,
      );
      if (!rateLimit.allowed) {
        // Throwing (rather than silently returning) lets BullMQ retry this
        // job with exponential backoff (see enqueueSocialPublishJob) — the
        // worker's "failed" handler below escalates to human review once
        // retries are exhausted, so a persistently rate-limited action is
        // never silently dropped or retried forever.
        throw new RateLimitExceededError(action.id);
      }

      const connection = await params.prisma.socialConnection.findUniqueOrThrow({
        where: { id: action.connectionId },
      });
      const adapter = getAdapterForPlatform(action.platform, adapterConfig);
      const accessToken = await getValidAccessToken(params.prisma, adapter, connection.id);

      try {
        let publishResult: { externalPostId: string };
        if (action.actionType === "POST") {
          publishResult = await adapter.publishPost(accessToken, action.generatedContent);
        } else if (action.actionType === "REPLY" || action.actionType === "DM_REPLY") {
          const threadOrCommentId =
            action.triggerEvent?.externalThreadId ?? action.triggerEvent?.externalEventId;
          if (!threadOrCommentId) {
            throw new Error(
              `Action ${action.id} is a ${action.actionType} with no trigger thread/comment id to reply to.`,
            );
          }
          publishResult = await adapter.publishReply(
            accessToken,
            threadOrCommentId,
            action.generatedContent,
          );
        } else {
          throw new Error(`Action type ${action.actionType} has no publish implementation.`);
        }

        await params.prisma.socialAction.update({
          where: { id: action.id },
          data: {
            status: "PUBLISHED",
            externalPostId: publishResult.externalPostId,
            publishedAt: new Date(),
          },
        });
        await params.prisma.auditEvent.create({
          data: {
            organisationId: action.organisationId,
            type: "SOCIAL_ACTION_PUBLISHED",
            metadata: {
              socialActionId: action.id,
              platform: action.platform,
              actionType: action.actionType,
            },
          },
        });
      } catch (error) {
        await params.prisma.socialAction.update({
          where: { id: action.id },
          data: {
            status: "FAILED",
            failureReason: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
    { connection: params.connection, concurrency: 2 },
  );

  worker.on("failed", (job, error) => {
    params.logger.error("social publish job failed", { jobId: job?.id, error });

    if (
      job &&
      error instanceof RateLimitExceededError &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      params.prisma.socialAction
        .update({
          where: { id: error.socialActionId },
          data: {
            status: "PENDING_HUMAN_APPROVAL",
            failureReason:
              "Rate limit repeatedly exceeded across retries; escalated for manual review.",
          },
        })
        .catch((updateError: unknown) => {
          params.logger.error("failed to escalate rate-limited social action", {
            actionId: error.socialActionId,
            updateError,
          });
        });
    }
  });

  return worker;
}
