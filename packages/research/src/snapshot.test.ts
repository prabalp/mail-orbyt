import { describe, expect, it, vi } from "vitest";
import { createResearchSnapshot } from "./snapshot";

function fakePrisma(facts: unknown[]) {
  return {
    researchFact: {
      findMany: vi.fn().mockResolvedValue(facts),
    },
    researchSnapshot: {
      create: vi.fn().mockImplementation(({ data }) => ({ id: "snap-1", ...data })),
    },
  };
}

describe("createResearchSnapshot", () => {
  it("only queries OBSERVED and USER_CONFIRMED facts", async () => {
    const prisma = fakePrisma([]);
    await createResearchSnapshot(prisma, {
      organisationId: "org-1",
      subjectType: "LEAD",
      leadId: "lead-1",
    });

    expect(prisma.researchFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["OBSERVED", "USER_CONFIRMED"] } }),
      }),
    );
  });

  it("maps facts to the snapshot's compact shape and persists it", async () => {
    const prisma = fakePrisma([
      {
        id: "fact-1",
        category: "company_description",
        value: "Builds developer tools.",
        sourceUrl: "https://acme.example/",
      },
    ]);

    const snapshot = await createResearchSnapshot(prisma, {
      organisationId: "org-1",
      subjectType: "COMPANY",
      companyId: "company-1",
    });

    expect(prisma.researchSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: "org-1",
        subjectType: "COMPANY",
        companyId: "company-1",
        facts: [
          {
            factId: "fact-1",
            category: "company_description",
            value: "Builds developer tools.",
            sourceUrl: "https://acme.example/",
          },
        ],
      }),
    });
    expect(snapshot.id).toBe("snap-1");
  });
});
