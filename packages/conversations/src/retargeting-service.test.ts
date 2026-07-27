import { describe, expect, it, vi } from "vitest";
import { listRetargetableLeads } from "./retargeting-service";

function fakePrisma(options: {
  completed: { leadId: string }[];
  activeElsewhere?: { leadId: string }[];
  alreadyInTarget?: { leadId: string }[];
  leads?: unknown[];
}) {
  const findManyMock = vi
    .fn()
    .mockResolvedValueOnce(options.completed)
    .mockResolvedValueOnce(options.activeElsewhere ?? []);
  if (options.alreadyInTarget !== undefined) {
    findManyMock.mockResolvedValueOnce(options.alreadyInTarget);
  }

  return {
    campaignEnrollment: { findMany: findManyMock },
    lead: { findMany: vi.fn().mockResolvedValue(options.leads ?? []) },
  };
}

describe("listRetargetableLeads", () => {
  it("returns an empty array when no enrollment has ever completed", async () => {
    const prisma = fakePrisma({ completed: [] });
    const result = await listRetargetableLeads(prisma, { organisationId: "org-1" });
    expect(result).toEqual([]);
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it("excludes leads currently active/pending in another campaign", async () => {
    const prisma = fakePrisma({
      completed: [{ leadId: "lead-1" }, { leadId: "lead-2" }],
      activeElsewhere: [{ leadId: "lead-2" }],
      leads: [{ id: "lead-1" }],
    });
    await listRetargetableLeads(prisma, { organisationId: "org-1" });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["lead-1"] } }) }),
    );
  });

  it("excludes leads already enrolled in the target campaign when excludeCampaignId is given", async () => {
    const prisma = fakePrisma({
      completed: [{ leadId: "lead-1" }, { leadId: "lead-2" }],
      activeElsewhere: [],
      alreadyInTarget: [{ leadId: "lead-1" }],
      leads: [{ id: "lead-2" }],
    });
    await listRetargetableLeads(prisma, {
      organisationId: "org-1",
      excludeCampaignId: "campaign-2",
    });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["lead-2"] } }) }),
    );
  });
});
