import { randomBytes } from "node:crypto";
import { createCampaign, enrollLeads, updateCampaign } from "@mail-orbyt/campaigns";
import { deleteLeadData, exportLeadData, purgeStaleData } from "@mail-orbyt/compliance";
import { syncRepliesForOutboxItem } from "@mail-orbyt/conversations";
import { prisma } from "@mail-orbyt/database";
import { encryptToken } from "@mail-orbyt/gmail";
import { isSuppressed } from "@mail-orbyt/leads";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs the compliance-critical paths against real Postgres: an
 * unsubscribe reply must actually suppress the lead (not just exit one
 * enrollment), erasure must cascade-delete every related table, and
 * retention purging must only touch what it's supposed to.
 */

function uniqueSlug(): string {
  return `compliance-test-org-${randomBytes(6).toString("hex")}`;
}

const ALWAYS_OPEN_WINDOW = {
  sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendingWindowStartMinute: 0,
  sendingWindowEndMinute: 1440,
};

describe("compliance (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

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
      await prisma.suppressionEntry.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    for (const userId of createdUserIds) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("suppresses the lead's real email when a reply is classified as an unsubscribe request", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Compliance Test Org", slug: uniqueSlug() },
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
      name: "Compliance Test Campaign",
      createdByUserId: "seed-user",
      ...ALWAYS_OPEN_WINDOW,
    });
    await prisma.campaignInbox.create({ data: { campaignId: campaign.id, inboxId: inbox.id } });
    const step = await prisma.campaignStep.create({
      data: {
        campaignId: campaign.id,
        orderIndex: 0,
        stepType: "INITIAL",
        useAiGeneration: false,
        manualSubject: "Hi",
        manualBody: "Body",
      },
    });
    await updateCampaign(prisma, org.id, campaign.id, { status: "ACTIVE" });

    const leadEmail = `jamie-${randomBytes(4).toString("hex")}@example.com`;
    const lead = await prisma.lead.create({
      data: { organisationId: org.id, firstName: "Jamie", email: leadEmail },
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

    expect(await isSuppressed(prisma, org.id, leadEmail)).toBe(false);

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
        from: `Jamie <${leadEmail}>`,
        subject: "Re: Hi",
        snippet: "Please unsubscribe me from this list.",
        internalDate: new Date(),
      },
    ];

    await syncRepliesForOutboxItem(prisma, fakeFetchThread, outboxItem.id);

    expect(await isSuppressed(prisma, org.id, leadEmail)).toBe(true);
  });

  it("cascade-deletes every related table when a lead is erased", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Compliance Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Sam",
        email: `sam-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    await prisma.researchFact.create({
      data: {
        organisationId: org.id,
        subjectType: "LEAD",
        leadId: lead.id,
        category: "professional_topics",
        value: "test fact",
        sourceUrl: "https://example.com/",
        extractionMethod: "OPEN_GRAPH",
        confidence: 0.5,
      },
    });

    const actingUser = await prisma.user.create({
      data: { email: `deleter-${randomBytes(4).toString("hex")}@example.com` },
    });
    createdUserIds.push(actingUser.id);

    const deleted = await deleteLeadData(prisma, org.id, lead.id, actingUser.id);
    expect(deleted).toBe(true);

    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
    expect(await prisma.researchFact.count({ where: { leadId: lead.id } })).toBe(0);

    const auditEvent = await prisma.auditEvent.findFirst({
      where: { organisationId: org.id, type: "DATA_DELETED" },
    });
    expect(auditEvent).not.toBeNull();
  });

  it("exports a full data bundle for a lead", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Compliance Test Org 3", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Robin",
        email: `robin-${randomBytes(4).toString("hex")}@example.com`,
      },
    });

    const actingUser = await prisma.user.create({
      data: { email: `exporter-${randomBytes(4).toString("hex")}@example.com` },
    });
    createdUserIds.push(actingUser.id);

    const bundle = await exportLeadData(prisma, org.id, lead.id, actingUser.id);
    expect(bundle?.lead.id).toBe(lead.id);
    expect(bundle?.researchFacts).toEqual([]);
  });

  it("purges only DISCARDED drafts and old import rows for the given organisation", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Compliance Test Org 4", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Casey",
        email: `casey-${randomBytes(4).toString("hex")}@example.com`,
      },
    });

    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const discardedDraft = await prisma.emailDraft.create({
      data: {
        organisationId: org.id,
        leadId: lead.id,
        generationType: "INITIAL",
        subject: "Old",
        body: "Old",
        modelUsed: "test",
        status: "DISCARDED",
      },
    });
    await prisma.emailDraft.update({
      where: { id: discardedDraft.id },
      data: { updatedAt: oldDate },
    });

    const keptDraft = await prisma.emailDraft.create({
      data: {
        organisationId: org.id,
        leadId: lead.id,
        generationType: "INITIAL",
        subject: "Recent",
        body: "Recent",
        modelUsed: "test",
        status: "DRAFT",
      },
    });

    const result = await purgeStaleData(prisma, org.id, 30);
    expect(result.discardedDraftsDeleted).toBe(1);

    expect(await prisma.emailDraft.findUnique({ where: { id: discardedDraft.id } })).toBeNull();
    expect(await prisma.emailDraft.findUnique({ where: { id: keptDraft.id } })).not.toBeNull();
  });
});
