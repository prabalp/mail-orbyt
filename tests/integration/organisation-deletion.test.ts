import { randomBytes } from "node:crypto";
import { deleteOrganisation, OrganisationNameMismatchError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs against the real Postgres from docker-compose. The whole point of
 * deleteOrganisation is that the schema's cascade deletes do the actual
 * work — a mocked unit test can't prove that a Lead, a Campaign, and their
 * own children really do disappear along with the organisation, or that the
 * ORGANISATION_DELETED audit event survives being written without the
 * organisationId FK that would otherwise cascade it away with everything
 * else in the same delete.
 */

function uniqueSlug(): string {
  return `org-deletion-test-${randomBytes(6).toString("hex")}`;
}

describe("deleteOrganisation (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    // Only orgs that survived (i.e. the mismatch-rejection test's org,
    // which is deliberately never deleted) need manual cleanup.
    for (const organisationId of createdOrgIds) {
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("cascades through every child record and leaves a survivable audit event", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Deletion Test Org", slug: uniqueSlug() },
    });

    const user = await prisma.user.create({
      data: { email: `owner-${randomBytes(4).toString("hex")}@example.com`, name: "Owner" },
    });
    await prisma.organisationMembership.create({
      data: { organisationId: org.id, userId: user.id, role: "OWNER" },
    });

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: { organisationId: org.id, name: "Test Campaign", createdByUserId: user.id },
    });
    await prisma.campaignEnrollment.create({
      data: { campaignId: campaign.id, leadId: lead.id, status: "PENDING" },
    });

    const deleted = await deleteOrganisation(prisma, {
      organisationId: org.id,
      confirmName: "Deletion Test Org",
      deletedByUserId: user.id,
    });
    expect(deleted).toBe(true);

    // The organisation and every child row are gone.
    expect(await prisma.organisation.findUnique({ where: { id: org.id } })).toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).toBeNull();
    expect(await prisma.campaign.findUnique({ where: { id: campaign.id } })).toBeNull();
    expect(
      await prisma.campaignEnrollment.findUnique({
        where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
      }),
    ).toBeNull();
    expect(
      await prisma.organisationMembership.findUnique({
        where: { organisationId_userId: { organisationId: org.id, userId: user.id } },
      }),
    ).toBeNull();

    // The user account itself (not owned by the organisation) survives.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();

    // The audit event survives — proving it was written without an
    // organisationId FK that would otherwise have cascaded it away in the
    // same delete.
    const auditEvent = await prisma.auditEvent.findFirst({
      where: { type: "ORGANISATION_DELETED", userId: user.id },
    });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.organisationId).toBeNull();
    expect(auditEvent?.metadata).toEqual(
      expect.objectContaining({ organisationId: org.id, organisationName: "Deletion Test Org" }),
    );

    await prisma.user.delete({ where: { id: user.id } });
    await prisma.auditEvent.deleteMany({ where: { userId: user.id } });
  });

  it("rejects a confirmName that doesn't match and deletes nothing", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Untouched Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    await expect(
      deleteOrganisation(prisma, {
        organisationId: org.id,
        confirmName: "the wrong name entirely",
        deletedByUserId: "someone",
      }),
    ).rejects.toBeInstanceOf(OrganisationNameMismatchError);

    expect(await prisma.organisation.findUnique({ where: { id: org.id } })).not.toBeNull();
  });
});
