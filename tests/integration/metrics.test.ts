import { randomBytes } from "node:crypto";
import { createMeeting, getQualifiedMeetingRate } from "@mail-orbyt/analytics";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs the primary metric (qualified meetings booked / unique prospects
 * contacted) against real Postgres. This is the number the whole product
 * is built around, so it's worth proving against real rows rather than
 * only a mocked Prisma client — in particular, that "contacted" only
 * counts distinct leads with a real SENT OutboxItem (not campaigns, not
 * scheduled-but-unsent items), and that an unqualified or cancelled
 * meeting never inflates the numerator.
 */

function uniqueSlug(): string {
  return `metrics-test-org-${randomBytes(6).toString("hex")}`;
}

describe("getQualifiedMeetingRate (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.meeting.deleteMany({ where: { organisationId } });
      await prisma.outboxItem.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("computes the rate from real SENT items and qualified meetings, ignoring unsent items and unqualified/cancelled meetings", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Metrics Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const leads = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        prisma.lead.create({
          data: {
            organisationId: org.id,
            firstName: `Lead${i}`,
            email: `lead${i}-${randomBytes(4).toString("hex")}@example.com`,
          },
        }),
      ),
    );

    const campaign = await prisma.campaign.create({
      data: { organisationId: org.id, name: "Metrics Test Campaign", createdByUserId: "seed-user" },
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

    // 3 of the 4 leads actually get a SENT item; the 4th only gets a
    // still-SCHEDULED item and must NOT count as "contacted".
    for (const lead of leads.slice(0, 3)) {
      const enrollment = await prisma.campaignEnrollment.create({
        data: { campaignId: campaign.id, leadId: lead.id, status: "ACTIVE" },
      });
      await prisma.outboxItem.create({
        data: {
          organisationId: org.id,
          campaignId: campaign.id,
          leadId: lead.id,
          campaignStepId: step.id,
          enrollmentId: enrollment.id,
          scheduledFor: new Date(),
          status: "SENT",
          sentAt: new Date(),
        },
      });
    }
    {
      const enrollment = await prisma.campaignEnrollment.create({
        data: { campaignId: campaign.id, leadId: leads[3]!.id, status: "PENDING" },
      });
      await prisma.outboxItem.create({
        data: {
          organisationId: org.id,
          campaignId: campaign.id,
          leadId: leads[3]!.id,
          campaignStepId: step.id,
          enrollmentId: enrollment.id,
          scheduledFor: new Date(Date.now() + 3600_000),
          status: "SCHEDULED",
        },
      });
    }

    // One qualified meeting for lead 0, one UNQUALIFIED meeting for lead 1
    // (must not count), and one qualified-but-CANCELLED meeting for lead 2
    // (must not count).
    await createMeeting(prisma, {
      organisationId: org.id,
      leadId: leads[0]!.id,
      createdByUserId: "seed-user",
    });
    await prisma.meeting.updateMany({ where: { leadId: leads[0]!.id }, data: { qualified: true } });

    await createMeeting(prisma, {
      organisationId: org.id,
      leadId: leads[1]!.id,
      createdByUserId: "seed-user",
    });
    // leads[1]'s meeting stays qualified=false (the default).

    const cancelled = await createMeeting(prisma, {
      organisationId: org.id,
      leadId: leads[2]!.id,
      createdByUserId: "seed-user",
    });
    await prisma.meeting.update({
      where: { id: cancelled.id },
      data: { qualified: true, status: "CANCELLED" },
    });

    const result = await getQualifiedMeetingRate(prisma, { organisationId: org.id });

    expect(result.uniqueProspectsContacted).toBe(3);
    expect(result.qualifiedMeetingsBooked).toBe(1);
    expect(result.rate).toBeCloseTo(1 / 3);
  });

  it("returns a null rate when the organisation has never contacted anyone", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Metrics Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const result = await getQualifiedMeetingRate(prisma, { organisationId: org.id });
    expect(result).toEqual({ uniqueProspectsContacted: 0, qualifiedMeetingsBooked: 0, rate: null });
  });
});
