import type { Prisma, PrismaClient } from "@mail-orbyt/database";
import type { Logger } from "@mail-orbyt/logging";
import {
  buildSocialAdapterConfigFromEnv,
  getAdapterForPlatform,
  getValidAccessToken,
} from "@mail-orbyt/social-platforms";
import {
  SOCIAL_POLL_QUEUE_NAME,
  enqueueSocialEventProcessing,
} from "@mail-orbyt/social-scheduling";
import { Worker, type ConnectionOptions } from "bullmq";

/**
 * Fires on the ~5 minute repeatable tick (see scheduleSocialPollTick in
 * @mail-orbyt/social-scheduling). For every CONNECTED social account whose
 * platform adapter exposes pollForEvents (all of LinkedIn/X/Reddit in v1,
 * plus Meta as a backstop alongside its webhook), fetches events since the
 * connection's lastSyncedAt, dedupe-inserts them into SocialInboundEvent
 * (the @@unique([connectionId, externalEventId]) constraint makes a
 * duplicate poll observation a no-op), and enqueues processing for each
 * genuinely new one.
 */
export function createSocialPollWorker(params: {
  connection: ConnectionOptions;
  prisma: PrismaClient;
  logger: Logger;
}): Worker {
  const adapterConfig = buildSocialAdapterConfigFromEnv();

  const worker = new Worker(
    SOCIAL_POLL_QUEUE_NAME,
    async () => {
      const connections = await params.prisma.socialConnection.findMany({
        where: { status: "CONNECTED" },
      });

      let newEvents = 0;
      for (const socialConnection of connections) {
        try {
          // Inside the try: an account on a platform whose OAuth app isn't
          // configured must not abort polling for every other account.
          const adapter = getAdapterForPlatform(socialConnection.platform, adapterConfig);
          if (!adapter.pollForEvents) continue;

          const accessToken = await getValidAccessToken(
            params.prisma,
            adapter,
            socialConnection.id,
          );
          const since = socialConnection.lastSyncedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
          const rawEvents = await adapter.pollForEvents(accessToken, since);

          for (const rawEvent of rawEvents) {
            const priorContact = await params.prisma.socialInboundEvent.findFirst({
              where: { connectionId: socialConnection.id, authorHandle: rawEvent.authorHandle },
              select: { id: true },
            });

            const inserted = await params.prisma.socialInboundEvent.upsert({
              where: {
                connectionId_externalEventId: {
                  connectionId: socialConnection.id,
                  externalEventId: rawEvent.externalEventId,
                },
              },
              create: {
                organisationId: socialConnection.organisationId,
                connectionId: socialConnection.id,
                platform: socialConnection.platform,
                eventType: rawEvent.eventType,
                externalEventId: rawEvent.externalEventId,
                externalThreadId: rawEvent.externalThreadId,
                authorHandle: rawEvent.authorHandle,
                authorIsFirstTimeContact: priorContact === null,
                contentText: rawEvent.contentText,
                rawPayload: rawEvent.rawPayload as Prisma.InputJsonValue,
                receivedAt: rawEvent.occurredAt,
              },
              // Already-seen events are left untouched — the upsert exists
              // only to make "insert if new" atomic and idempotent against a
              // concurrent poll tick or webhook delivery for the same event.
              update: {},
            });

            if (inserted.processedAt === null) {
              await enqueueSocialEventProcessing(params.connection, {
                socialInboundEventId: inserted.id,
              });
              newEvents += 1;
            }
          }

          await params.prisma.socialConnection.update({
            where: { id: socialConnection.id },
            data: { lastSyncedAt: new Date() },
          });
        } catch (error) {
          params.logger.error("social poll failed for connection", {
            connectionId: socialConnection.id,
            platform: socialConnection.platform,
            error,
          });
        }
      }

      if (newEvents > 0) {
        params.logger.info("social poll tick found new events", { newEvents });
      }
    },
    { connection: params.connection, concurrency: 1 },
  );

  worker.on("failed", (job, error) => {
    params.logger.error("social poll tick failed", { jobId: job?.id, error });
  });

  return worker;
}
