import { randomBytes } from "node:crypto";
import { createCampaign, enrollLeads, updateCampaign } from "@mail-orbyt/campaigns";
import { prisma } from "@mail-orbyt/database";
import { encryptToken } from "@mail-orbyt/gmail";
import { parseImportedEmails } from "@mail-orbyt/leads";
import {
  applyJourneyOutcome,
  enqueueDueOutboxItems,
  processOutboxItem,
} from "@mail-orbyt/scheduling";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A branching journey end to end against real Postgres: the lead's imported
 * email graph decides what is sent next, driven by the no-reply timer and by
 * a routed reply, with every decision logged.
 */

const GRAPH = JSON.stringify({
  start: "intro",
  emails: {
    intro: {
      subject: "Hi {{firstName}}",
      body: "Intro email",
      next: { no_reply: { to: "bump", afterDays: 3 }, interested: { to: "book" } },
    },
    bump: { subject: "Bump", body: "Bump email", next: { no_reply: "END" } },
    book: { subject: "Book a time", body: "Booking email" },
  },
});

const CAMPAIGN_GRAPH = {
  start: "welcome",
  nodes: [
    {
      key: "welcome",
      label: "Welcome",
      subject: "{{firstName}}, about {{company}}",
      body: "We help {{company}} with {{pain}}.",
      x: 0,
      y: 0,
    },
    { key: "bump", label: "Bump", subject: "Bump", body: "Checking in", x: 0, y: 0 },
  ],
  edges: [{ from: "welcome", outcome: "no_reply", to: "bump", afterDays: 1 }],
  variables: { pain: { source: "fixed", value: "slow outbound" } },
};

describe("journey routing (end to end against real Postgres)", () => {
  const orgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of orgIds) {
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

  async function setup(
    options: {
      importGraph?: boolean;
      journeyGraph?: object;
      contentSource?: "TEMPLATE" | "IMPORTED";
    } = {},
  ) {
    const org = await prisma.organisation.create({
      data: { name: "Journey Org", slug: `journey-org-${randomBytes(6).toString("hex")}` },
    });
    orgIds.push(org.id);
    const inbox = await prisma.inbox.create({
      data: {
        organisationId: org.id,
        emailAddress: `sender-${randomBytes(4).toString("hex")}@acme.example`,
        status: "CONNECTED",
        dailySendLimit: 30,
        connectedByUserId: "seed-user",
        encryptedAccessToken: encryptToken("a"),
        encryptedRefreshToken: encryptToken("r"),
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Journey",
      routingMode: "JOURNEY",
      contentSource: options.contentSource ?? "IMPORTED",
      createdByUserId: "seed-user",
      sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      sendingWindowStartMinute: 0,
      sendingWindowEndMinute: 1440,
      inboxCooldownMinutes: 0,
    });
    await prisma.campaignInbox.create({ data: { campaignId: campaign.id, inboxId: inbox.id } });
    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    const parsed = parseImportedEmails("3", GRAPH);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await prisma.leadImportedEmail.createMany({
      data: (options.importGraph === false ? [] : parsed.emails).map((email) => ({
        organisationId: org.id,
        leadId: lead.id,
        sequence: email.sequence,
        emailType: email.emailType,
        subject: email.subject,
        body: email.body,
        nodeKey: email.nodeKey,
        isStart: email.isStart ?? false,
        edges: email.edges as object,
      })),
    });
    if (options.journeyGraph) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { journeyGraph: options.journeyGraph },
      });
    }
    await updateCampaign(prisma, org.id, campaign.id, { status: "ACTIVE" });
    await enrollLeads(prisma, org.id, campaign.id, [lead.id]);

    const sent: { subject: string; body: string }[] = [];
    const deps = {
      resolveAiGenerator: async () => undefined,
      sendEmail: async (_: string, message: { subject: string; body: string }) => {
        sent.push(message);
        return { messageId: `m-${sent.length}`, threadId: `t-${sent.length}` };
      },
      getSenderContext: async () => ({ senderName: "Alex", senderCompanyName: "Mail Orbyt" }),
      emergencyStop: false,
    };
    const enrollment = await prisma.campaignEnrollment.findFirstOrThrow({
      where: { campaignId: campaign.id },
    });

    async function tickAndSendAll() {
      await enqueueDueOutboxItems(prisma);
      const due = await prisma.outboxItem.findMany({
        where: { campaignId: campaign.id, status: "SCHEDULED" },
      });
      for (const item of due) await processOutboxItem(prisma, deps, item.id);
    }
    return { campaign, enrollment, sent, tickAndSendAll };
  }

  it("sends the start node, then follows no_reply to the next node, then ends", async () => {
    const { enrollment, sent, tickAndSendAll } = await setup();

    await tickAndSendAll();
    expect(sent.map((m) => m.subject)).toEqual(["Hi Jamie"]);

    // Nothing more goes out while the no-reply timer is still running.
    await tickAndSendAll();
    expect(sent).toHaveLength(1);

    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { nextDecisionAt: new Date(Date.now() - 1000) },
    });
    await tickAndSendAll();
    expect(sent.map((m) => m.subject)).toEqual(["Hi Jamie", "Bump"]);

    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { nextDecisionAt: new Date(Date.now() - 1000) },
    });
    await tickAndSendAll();
    const done = await prisma.campaignEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(done.status).toBe("COMPLETED");
    expect(sent).toHaveLength(2);

    const decisions = await prisma.enrollmentRoutingDecision.findMany({
      where: { enrollmentId: enrollment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(decisions.map((d) => [d.fromNodeKey, d.outcome, d.toNodeKey])).toEqual([
      ["intro", "no_reply", "bump"],
      ["bump", "no_reply", null],
    ]);
  });

  it("routes an interested reply to the booking node", async () => {
    const { enrollment, sent, tickAndSendAll } = await setup();
    await tickAndSendAll();

    const result = await applyJourneyOutcome(prisma, enrollment.id, {
      trigger: "REPLY",
      outcome: "interested",
      source: "RULE",
    });
    expect(result).toEqual({ routed: true, toNodeKey: "book", ended: false });

    await tickAndSendAll();
    expect(sent.map((m) => m.subject)).toEqual(["Hi Jamie", "Book a time"]);
  });

  it("sends a campaign-level graph with variables filled for the lead", async () => {
    const { campaign, enrollment, sent, tickAndSendAll } = await setup({
      importGraph: false,
      contentSource: "TEMPLATE",
      journeyGraph: CAMPAIGN_GRAPH,
    });
    const company = await prisma.company.create({
      data: { organisationId: campaign.organisationId, name: "Acme" },
    });
    await prisma.lead.update({ where: { id: enrollment.leadId }, data: { companyId: company.id } });

    await tickAndSendAll();
    expect(sent[0]?.subject).toBe("Jamie, about Acme");
    expect(sent[0]?.body).toContain("We help Acme with slow outbound.");

    await prisma.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: { nextDecisionAt: new Date(Date.now() - 1000) },
    });
    await tickAndSendAll();
    expect(sent.map((m) => m.subject)).toEqual(["Jamie, about Acme", "Bump"]);
  });

  it("sends a graph node that uses the lead's uploaded email by sequence number", async () => {
    const { campaign, sent, tickAndSendAll } = await setup({
      journeyGraph: {
        start: "first",
        nodes: [
          { key: "first", label: "First", subject: "", body: "", importedSequence: 2, x: 0, y: 0 },
        ],
        edges: [],
        variables: {},
      },
    });
    expect(campaign.id).toBeTruthy();
    await tickAndSendAll();
    // The lead's sequence-2 upload is the "bump" email from the imported graph.
    expect(sent.map((m) => m.subject)).toEqual(["Bump"]);
  });
});
