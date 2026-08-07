import { randomBytes } from "node:crypto";
import { createCampaign, enrollLeads, updateCampaign } from "@mail-orbyt/campaigns";
import { syncRepliesForOutboxItem } from "@mail-orbyt/conversations";
import { prisma } from "@mail-orbyt/database";
import { encryptToken } from "@mail-orbyt/gmail";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs reply detection against real Postgres, with a fake Gmail thread
 * fetcher (no real Gmail account exists in this environment). This proves
 * the DB side of the safety rule that matters most in this phase: a reply
 * from the lead must exit the enrollment, stopping all further automated
 * sends, and must never be recorded twice.
 */

function uniqueSlug(): string {
  return `reply-sync-test-org-${randomBytes(6).toString("hex")}`;
}

const ALWAYS_OPEN_WINDOW = {
  sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendingWindowStartMinute: 0,
  sendingWindowEndMinute: 1440,
  // Cooldown off: these tests send several emails from one inbox back to
  // back, which the default per-inbox throttle would (correctly) defer.
  // The throttle has its own test in tests/integration/outbox.test.ts.
  inboxCooldownMinutes: 0,
};

describe("syncRepliesForOutboxItem (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.conversationMessage.deleteMany({ where: { conversation: { organisationId } } });
      await prisma.conversation.deleteMany({ where: { organisationId } });
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

  it("records a reply, classifies it, and exits the enrollment", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Reply Sync Test Org", slug: uniqueSlug() },
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
      name: "Reply Sync Test Campaign",
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
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    await enrollLeads(prisma, org.id, campaign.id, [lead.id]);
    const enrollment = await prisma.campaignEnrollment.findUniqueOrThrow({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
    });

    const outboxItem = await prisma.outboxItem.create({
      data: {
        organisationId: org.id,
        campaignId: campaign.id,
        leadId: lead.id,
        campaignStepId: step.id,
        enrollmentId: enrollment.id,
        scheduledFor: new Date(),
        status: "SENT",
        sentAt: new Date(),
        inboxId: inbox.id,
        subject: "Hi",
        body: "Body",
        providerMessageId: "gmail-msg-sent",
        providerThreadId: "gmail-thread-1",
      },
    });
    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { status: "ACTIVE" },
    });

    const fakeFetchThread = async () => [
      {
        gmailMessageId: "gmail-msg-sent",
        from: inbox.emailAddress,
        subject: "Hi",
        snippet: "Body",
        internalDate: new Date(),
      },
      {
        gmailMessageId: "gmail-msg-reply",
        from: `Jamie <${lead.email}>`,
        subject: "Re: Hi",
        snippet: "Thanks, but not interested at this time.",
        internalDate: new Date(),
      },
    ];

    const result = await syncRepliesForOutboxItem(prisma, fakeFetchThread, outboxItem.id);
    expect(result.newReplies).toBe(1);

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: result.conversationId! },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.classification).toBe("NOT_INTERESTED");
    expect(messages[0]?.direction).toBe("INBOUND");

    const updatedEnrollment = await prisma.campaignEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(updatedEnrollment.status).toBe("EXITED");
    expect(updatedEnrollment.exitReason).toBe("Lead replied");

    // Reprocessing the same thread must not duplicate the message or re-exit.
    const second = await syncRepliesForOutboxItem(prisma, fakeFetchThread, outboxItem.id);
    expect(second.newReplies).toBe(0);
    const messagesAfterRerun = await prisma.conversationMessage.findMany({
      where: { conversationId: result.conversationId! },
    });
    expect(messagesAfterRerun).toHaveLength(1);
  });
});
