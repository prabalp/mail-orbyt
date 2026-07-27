import { randomBytes } from "node:crypto";
import { createCampaign, enrollLeads } from "@mail-orbyt/campaigns";
import { addSuppressionEntry } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs against the real Postgres from docker-compose. Enrollment's
 * suppression check is the one place the campaign builder touches
 * compliance — worth proving against a real SuppressionEntry row rather
 * than a mocked isSuppressed, since a bug here would mean a suppressed
 * contact silently gets enrolled as a normal PENDING lead.
 */

function uniqueSlug(): string {
  return `campaign-test-org-${randomBytes(6).toString("hex")}`;
}

describe("enrollLeads (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.campaignEnrollment.deleteMany({ where: { campaign: { organisationId } } });
      await prisma.campaign.deleteMany({ where: { organisationId } });
      await prisma.suppressionEntry.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("enrolls a normal lead as PENDING and a suppressed lead as SUPPRESSED", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Campaign Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const normalLead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    const suppressedEmail = `blocked-${randomBytes(4).toString("hex")}@example.com`;
    const suppressedLead = await prisma.lead.create({
      data: { organisationId: org.id, firstName: "Alex", email: suppressedEmail },
    });

    await addSuppressionEntry(prisma, {
      organisationId: org.id,
      type: "EMAIL",
      value: suppressedEmail,
      reason: "MANUAL_DO_NOT_CONTACT",
    });

    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Test Campaign",
      createdByUserId: "seed-user",
    });

    const result = await enrollLeads(prisma, org.id, campaign.id, [
      normalLead.id,
      suppressedLead.id,
    ]);
    expect(result).toEqual({ enrolled: 1, alreadyEnrolled: 0, suppressed: 1 });

    const enrollments = await prisma.campaignEnrollment.findMany({
      where: { campaignId: campaign.id },
    });
    const byLeadId = new Map(enrollments.map((e) => [e.leadId, e.status]));
    expect(byLeadId.get(normalLead.id)).toBe("PENDING");
    expect(byLeadId.get(suppressedLead.id)).toBe("SUPPRESSED");
  });

  it("does not duplicate an enrollment on a repeat call", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Campaign Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Sam",
        email: `sam-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    const campaign = await createCampaign(prisma, {
      organisationId: org.id,
      name: "Test Campaign 2",
      createdByUserId: "seed-user",
    });

    await enrollLeads(prisma, org.id, campaign.id, [lead.id]);
    const second = await enrollLeads(prisma, org.id, campaign.id, [lead.id]);
    expect(second).toEqual({ enrolled: 0, alreadyEnrolled: 1, suppressed: 0 });

    const count = await prisma.campaignEnrollment.count({ where: { campaignId: campaign.id } });
    expect(count).toBe(1);
  });
});
