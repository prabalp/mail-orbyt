import { randomBytes } from "node:crypto";
import { createResearchSnapshot } from "@mail-orbyt/research";
import { prisma } from "@mail-orbyt/database";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runs against the real Postgres from docker-compose. Snapshotting facts is
 * the hand-off point between deterministic research (Phase 4) and AI email
 * generation (Phase 5) — a bug here (e.g. leaking a rejected or conflicted
 * fact into a snapshot) would mean the model gets fed a fact a human
 * explicitly disputed or rejected, so it's worth exercising against a real
 * DB rather than only a mocked Prisma client.
 */

function uniqueSlug(): string {
  return `snapshot-test-org-${randomBytes(6).toString("hex")}`;
}

describe("createResearchSnapshot (end to end against real Postgres)", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const organisationId of createdOrgIds) {
      await prisma.researchSnapshot.deleteMany({ where: { organisationId } });
      await prisma.researchFact.deleteMany({ where: { organisationId } });
      await prisma.lead.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("includes OBSERVED and USER_CONFIRMED facts but excludes REJECTED, EXPIRED, and CONFLICTED ones", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Snapshot Test Org", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Jamie",
        email: `jamie-${randomBytes(4).toString("hex")}@example.com`,
      },
    });

    await prisma.researchFact.createMany({
      data: [
        {
          organisationId: org.id,
          subjectType: "LEAD",
          leadId: lead.id,
          category: "professional_topics",
          value: "observed fact",
          sourceUrl: "https://example.com/a",
          extractionMethod: "OPEN_GRAPH",
          confidence: 0.5,
          status: "OBSERVED",
        },
        {
          organisationId: org.id,
          subjectType: "LEAD",
          leadId: lead.id,
          category: "relevant_education",
          value: "confirmed fact",
          sourceUrl: "https://example.com/b",
          extractionMethod: "JSON_LD",
          confidence: 0.7,
          status: "USER_CONFIRMED",
        },
        {
          organisationId: org.id,
          subjectType: "LEAD",
          leadId: lead.id,
          category: "awards",
          value: "rejected fact",
          sourceUrl: "https://example.com/c",
          extractionMethod: "JSON_LD",
          confidence: 0.7,
          status: "USER_REJECTED",
        },
        {
          organisationId: org.id,
          subjectType: "LEAD",
          leadId: lead.id,
          category: "companies_worked_for",
          value: "conflicted fact",
          sourceUrl: "https://example.com/d",
          extractionMethod: "JSON_LD",
          confidence: 0.7,
          status: "CONFLICTED",
        },
        {
          organisationId: org.id,
          subjectType: "LEAD",
          leadId: lead.id,
          category: "professional_topics",
          value: "expired fact",
          sourceUrl: "https://example.com/e",
          extractionMethod: "META_TAG",
          confidence: 0.3,
          status: "EXPIRED",
        },
      ],
    });

    const snapshot = await createResearchSnapshot(prisma, {
      organisationId: org.id,
      subjectType: "LEAD",
      leadId: lead.id,
    });

    const facts = snapshot.facts as { category: string; value: string }[];
    const values = facts.map((f) => f.value);

    expect(values).toContain("observed fact");
    expect(values).toContain("confirmed fact");
    expect(values).not.toContain("rejected fact");
    expect(values).not.toContain("conflicted fact");
    expect(values).not.toContain("expired fact");
    expect(facts).toHaveLength(2);
  });

  it("persists a retrievable snapshot row scoped to the organisation", async () => {
    const org = await prisma.organisation.create({
      data: { name: "Snapshot Test Org 2", slug: uniqueSlug() },
    });
    createdOrgIds.push(org.id);

    const lead = await prisma.lead.create({
      data: {
        organisationId: org.id,
        firstName: "Alex",
        email: `alex-${randomBytes(4).toString("hex")}@example.com`,
      },
    });

    const snapshot = await createResearchSnapshot(prisma, {
      organisationId: org.id,
      subjectType: "LEAD",
      leadId: lead.id,
    });

    const stored = await prisma.researchSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
    expect(stored.organisationId).toBe(org.id);
    expect(stored.leadId).toBe(lead.id);
    expect(stored.facts).toEqual([]);
  });
});
