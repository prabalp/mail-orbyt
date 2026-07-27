import { randomBytes } from "node:crypto";
import { createCampaign, enrollLeads, updateCampaign } from "@mail-orbyt/campaigns";
import { prisma } from "@mail-orbyt/database";
import { encryptToken } from "@mail-orbyt/gmail";
import { enqueueDueOutboxItems, processOutboxItem } from "@mail-orbyt/scheduling";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs the full outbox pipeline (schedule -> materialize -> "send" ->
 * advance enrollment -> schedule the next step) against real Postgres,
 * with a fake sendEmail so no real Gmail API call happens. This is the
 * integration point where campaigns (Phase 7), inboxes (Phase 6), and the
 * scheduler (Phase 8) all come together — worth proving end to end rather
 * than only through each package's own mocked unit tests.
 */

function uniqueSlug(): string {
  return `outbox-test-org-${randomBytes(6).toString("hex")}`;
}

const ALWAYS_OPEN_WINDOW = {
  sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendingWindowStartMinute: 0,
  sendingWindowEndMinute: 1440,
};

describe("outbox pipeline (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.outboxItem.deleteMany({ where: { organisationId } });
      await prisma.campaignEnrollment.deleteMany({ where: { campaign: { organisationId } } });
      await prisma.campaignInbox.deleteMany({ where: { campaign: { organisationId } } });
      await prisma.campaignStep.deleteMany({ where: { campaign: { organisationId } } });
      await prisma.campaign.deleteMany({ where: { organisationId } });
      await prisma.inbox.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("sends a two-step manual sequence end to end and completes the enrollment", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Outbox Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const inbox = await prisma.inbox.create({
      data: {
        organisationId: org.id,
        emailAddress: `sender-${randomBytes(4).toString("hex")}@acme.example`,
        status: "CONNECTED",
        dailySendLimit: 30,
        connectedByUserId: "seed-user",
        encryptedAccessToken: encryptToken("fake-access-token"),
        encryptedRefreshToken: encryptToken("fake-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Outbox Test Campaign",
      createdByUserId: "seed-user",
      ...ALWAYS_OPEN_WINDOW,
    });
    await prisma.campaignInbox.create({ data: { campaignId: campaign.id, inboxId: inbox.id } });

    const step1 = await prisma.campaignStep.create({
      data: {
        campaignId: campaign.id,
        orderIndex: 0,
        stepType: "INITIAL",
        delayDays: 0,
        useAiGeneration: false,
        manualSubject: "Hi {{firstName}}",
        manualBody: "Would you be open to a quick call?",
      },
    });
    await prisma.campaignStep.create({
      data: {
        campaignId: campaign.id,
        orderIndex: 1,
        stepType: "FOLLOW_UP",
        delayDays: 0,
        useAiGeneration: false,
        manualSubject: "Following up",
        manualBody: "Just circling back on my last note.",
      },
    });

    await updateCampaign(prisma, org.id, campaign.id, { status: "ACTIVE" });

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    await enrollLeads(prisma, org.id, campaign.id, [lead.id]);

    const sentMessages: { to: string; subject: string; body: string }[] = [];
    const deps = {
      aiGenerator: undefined,
      sendEmail: async (
        _inboxId: string,
        message: { to: string; subject: string; body: string },
      ) => {
        sentMessages.push(message);
        return {
          messageId: `fake-message-${sentMessages.length}`,
          threadId: `fake-thread-${sentMessages.length}`,
        };
      },
      getSenderContext: async () => ({ senderName: "Alex", senderCompanyName: "Mail Orbyt" }),
      emergencyStop: false,
    };

    // Tick 1: schedule + send step 1.
    await enqueueDueOutboxItems(prisma);
    const item1 = await prisma.outboxItem.findUniqueOrThrow({
      where: {
        campaignId_leadId_campaignStepId: {
          campaignId: campaign.id,
          leadId: lead.id,
          campaignStepId: step1.id,
        },
      },
    });
    const processed1 = await processOutboxItem(prisma, deps, item1.id);
    expect(processed1?.status).toBe("SENT");
    expect(sentMessages[0]).toEqual({
      to: lead.email,
      subject: "Hi Jamie",
      body: "Would you be open to a quick call?",
    });

    const enrollmentAfterStep1 = await prisma.campaignEnrollment.findUniqueOrThrow({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
    });
    expect(enrollmentAfterStep1.currentStepIndex).toBe(1);
    expect(enrollmentAfterStep1.status).toBe("ACTIVE");

    // Tick 2: the next OutboxItem should already have been scheduled by
    // processOutboxItem itself (via scheduleNextStepForEnrollment) — but
    // call enqueueDueOutboxItems again to prove it's idempotent either way.
    await enqueueDueOutboxItems(prisma);
    const step2 = await prisma.campaignStep.findUniqueOrThrow({
      where: { campaignId_orderIndex: { campaignId: campaign.id, orderIndex: 1 } },
    });
    const item2 = await prisma.outboxItem.findUniqueOrThrow({
      where: {
        campaignId_leadId_campaignStepId: {
          campaignId: campaign.id,
          leadId: lead.id,
          campaignStepId: step2.id,
        },
      },
    });
    const processed2 = await processOutboxItem(prisma, deps, item2.id);
    expect(processed2?.status).toBe("SENT");
    expect(sentMessages).toHaveLength(2);

    const enrollmentAfterStep2 = await prisma.campaignEnrollment.findUniqueOrThrow({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
    });
    expect(enrollmentAfterStep2.currentStepIndex).toBe(2);

    // No third step exists, so the enrollment should now be COMPLETED.
    const totalOutboxItems = await prisma.outboxItem.count({ where: { campaignId: campaign.id } });
    expect(totalOutboxItems).toBe(2);
    expect(enrollmentAfterStep2.status).toBe("COMPLETED");
  });

  it("does not double-send when the same OutboxItem is processed twice", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Outbox Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const inbox = await prisma.inbox.create({
      data: {
        organisationId: org.id,
        emailAddress: `sender2-${randomBytes(4).toString("hex")}@acme.example`,
        status: "CONNECTED",
        dailySendLimit: 30,
        connectedByUserId: "seed-user",
        encryptedAccessToken: encryptToken("fake-access-token"),
        encryptedRefreshToken: encryptToken("fake-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Outbox Test Campaign 2",
      createdByUserId: "seed-user",
      ...ALWAYS_OPEN_WINDOW,
    });
    await prisma.campaignInbox.create({ data: { campaignId: campaign.id, inboxId: inbox.id } });
    const step = await prisma.campaignStep.create({
      data: {
        campaignId: campaign.id,
        orderIndex: 0,
        stepType: "INITIAL",
        delayDays: 0,
        useAiGeneration: false,
        manualSubject: "Hi",
        manualBody: "Body",
      },
    });
    await updateCampaign(prisma, org.id, campaign.id, { status: "ACTIVE" });

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Sam",
        email: `sam-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    await enrollLeads(prisma, org.id, campaign.id, [lead.id]);
    await enqueueDueOutboxItems(prisma);
    const item = await prisma.outboxItem.findUniqueOrThrow({
      where: {
        campaignId_leadId_campaignStepId: {
          campaignId: campaign.id,
          leadId: lead.id,
          campaignStepId: step.id,
        },
      },
    });

    let sendCount = 0;
    const deps = {
      aiGenerator: undefined,
      sendEmail: async () => {
        sendCount += 1;
        return { messageId: "fake-message", threadId: "fake-thread" };
      },
      getSenderContext: async () => ({ senderName: "Alex", senderCompanyName: "Mail Orbyt" }),
      emergencyStop: false,
    };

    await processOutboxItem(prisma, deps, item.id);
    await processOutboxItem(prisma, deps, item.id); // reprocess the same item

    expect(sendCount).toBe(1);
  });
});
