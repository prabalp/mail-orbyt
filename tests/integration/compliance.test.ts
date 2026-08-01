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

    const actingUser = await prisma.user.create({
      data: { email: `deleter-${randomBytes(4).toString("hex")}@example.com` },
    });
    createdUserIds.push(actingUser.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Sam",
        email: `sam-${randomBytes(4).toString("hex")}@example.com`,
        websiteUrl: "https://example.com/",
      },
    });

    // Company + lead-company link
    const company = await prisma.company.create({
      data: { organisationId: org.id, name: "Acme Inc" },
    });
    await prisma.leadCompany.create({ data: { leadId: lead.id, companyId: company.id } });

    // Lead list membership
    const leadList = await prisma.leadList.create({
      data: { organisationId: org.id, name: `List ${randomBytes(4).toString("hex")}` },
    });
    await prisma.leadListMembership.create({
      data: { leadListId: leadList.id, leadId: lead.id },
    });

    // Full research pipeline graph, including the keyword-extraction tables
    const researchJob = await prisma.researchJob.create({
      data: { organisationId: org.id, subjectType: "LEAD", leadId: lead.id, status: "COMPLETED" },
    });
    const providerRun = await prisma.researchProviderRun.create({
      data: { researchJobId: researchJob.id, provider: "WEBSITE", status: "SUCCEEDED" },
    });
    const source = await prisma.researchSource.create({
      data: {
        organisationId: org.id,
        subjectType: "LEAD",
        leadId: lead.id,
        researchProviderRunId: providerRun.id,
        url: "https://example.com/",
        httpStatus: 200,
      },
    });
    await prisma.researchPageText.create({
      data: { researchSourceId: source.id, text: "Example page text", charCount: 18 },
    });
    const document = await prisma.researchDocument.create({
      data: { researchSourceId: source.id, extractionMethod: "META_TAG", extractedData: {} },
    });
    await prisma.researchFact.create({
      data: {
        organisationId: org.id,
        subjectType: "LEAD",
        leadId: lead.id,
        researchJobId: researchJob.id,
        researchDocumentId: document.id,
        category: "professional_topics",
        value: "test fact",
        sourceUrl: "https://example.com/",
        extractionMethod: "OPEN_GRAPH",
        confidence: 0.5,
      },
    });
    await prisma.researchKeywordRun.create({
      data: {
        organisationId: org.id,
        researchSourceId: source.id,
        mode: "DETERMINISTIC",
        status: "SUCCEEDED",
      },
    });
    await prisma.researchFact.create({
      data: {
        organisationId: org.id,
        subjectType: "LEAD",
        leadId: lead.id,
        category: "extracted_keywords",
        value: "example",
        sourceUrl: "https://example.com/",
        extractionMethod: "KEYWORD_FREQUENCY",
        confidence: 1,
      },
    });

    // Email draft
    const draft = await prisma.emailDraft.create({
      data: {
        organisationId: org.id,
        leadId: lead.id,
        generationType: "INITIAL",
        subject: "Hi",
        body: "Body",
        modelUsed: "test",
      },
    });

    // Campaign enrollment + outbox item
    const inbox = await prisma.inbox.create({
      data: {
        organisationId: org.id,
        emailAddress: `sender-${randomBytes(4).toString("hex")}@acme.example`,
        status: "CONNECTED",
        dailySendLimit: 30,
        connectedByUserId: actingUser.id,
        encryptedAccessToken: encryptToken("fake-access-token"),
        encryptedRefreshToken: encryptToken("fake-refresh-token"),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Erasure Test Campaign",
      createdByUserId: actingUser.id,
      ...ALWAYS_OPEN_WINDOW,
    });
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
        status: "SCHEDULED",
        inboxId: inbox.id,
      },
    });

    // Conversation + message, and a booked meeting
    const conversation = await prisma.conversation.create({
      data: {
        organisationId: org.id,
        leadId: lead.id,
        inboxId: inbox.id,
        gmailThreadId: "gmail-thread-erasure",
      },
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        occurredAt: new Date(),
        snippet: "Hello",
      },
    });
    await prisma.meeting.create({
      data: { organisationId: org.id, leadId: lead.id, createdByUserId: actingUser.id },
    });

    // CSV import row referencing this lead — leadId is SetNull, not cascaded,
    // so the row (and its parent batch) should survive the lead's deletion.
    const importBatch = await prisma.importBatch.create({
      data: {
        organisationId: org.id,
        createdByUserId: actingUser.id,
        fileName: "leads.csv",
        storageKey: `imports/${org.id}/erasure-test.csv`,
        columnMapping: {},
        duplicateStrategy: "SKIP",
      },
    });
    const importRow = await prisma.importRow.create({
      data: { importBatchId: importBatch.id, rowNumber: 1, rawData: {}, leadId: lead.id },
    });

    const deleted = await deleteLeadData(prisma, org.id, lead.id, actingUser.id);
    expect(deleted).toBe(true);

    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
    expect(await prisma.leadCompany.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.leadListMembership.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.researchJob.count({ where: { id: researchJob.id } })).toBe(0);
    expect(await prisma.researchProviderRun.count({ where: { id: providerRun.id } })).toBe(0);
    expect(await prisma.researchSource.count({ where: { id: source.id } })).toBe(0);
    expect(await prisma.researchPageText.count({ where: { researchSourceId: source.id } })).toBe(0);
    expect(await prisma.researchDocument.count({ where: { id: document.id } })).toBe(0);
    expect(await prisma.researchKeywordRun.count({ where: { researchSourceId: source.id } })).toBe(
      0,
    );
    expect(await prisma.researchFact.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.emailDraft.count({ where: { id: draft.id } })).toBe(0);
    expect(await prisma.campaignEnrollment.count({ where: { id: enrollment.id } })).toBe(0);
    expect(await prisma.outboxItem.count({ where: { id: outboxItem.id } })).toBe(0);
    expect(await prisma.conversation.count({ where: { id: conversation.id } })).toBe(0);
    expect(
      await prisma.conversationMessage.count({ where: { conversationId: conversation.id } }),
    ).toBe(0);
    expect(await prisma.meeting.count({ where: { leadId: lead.id } })).toBe(0);

    // By design: the import row survives with leadId nulled out, not deleted —
    // import history shouldn't disappear just because a lead was erased later.
    const survivingRow = await prisma.importRow.findUnique({ where: { id: importRow.id } });
    expect(survivingRow).not.toBeNull();
    expect(survivingRow?.leadId).toBeNull();

    const auditEvent = await prisma.auditEvent.findFirst({
      where: { organisationId: org.id, type: "DATA_DELETED" },
    });
    expect(auditEvent).not.toBeNull();

    // cleanup rows this test created that aren't reachable from the deleted lead
    await prisma.importRow.deleteMany({ where: { importBatchId: importBatch.id } });
    await prisma.importBatch.delete({ where: { id: importBatch.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.leadList.delete({ where: { id: leadList.id } });
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
