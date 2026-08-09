import { describe, expect, it, vi } from "vitest";
import { archiveLeads, buildLeadWhere, listLeadIdsMatching, listLeads } from "./leads-service";

function fakePrisma(leads: unknown[] = []) {
  return {
    lead: {
      findMany: vi.fn().mockResolvedValue(leads),
      count: vi.fn().mockResolvedValue(leads.length),
      updateMany: vi.fn().mockResolvedValue({ count: leads.length }),
    },
  };
}

describe("listLeads", () => {
  it("scopes every query to the given organisationId", async () => {
    const prisma = fakePrisma();
    await listLeads(prisma, { organisationId: "org-1", page: 1, pageSize: 25 });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organisationId: "org-1" }) }),
    );
  });

  it("defaults to ACTIVE status when none is given", async () => {
    const prisma = fakePrisma();
    await listLeads(prisma, { organisationId: "org-1", page: 1, pageSize: 25 });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("matches a full 'First Last' search against separate firstName/lastName columns", async () => {
    const prisma = fakePrisma();
    await listLeads(prisma, {
      organisationId: "org-1",
      page: 1,
      pageSize: 25,
      search: "Patrick Collison",
    });

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    // Two words -> AND of two per-word OR clauses, not one literal substring match.
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toContainEqual({
      firstName: { contains: "Patrick", mode: "insensitive" },
    });
    expect(where.AND[1].OR).toContainEqual({
      lastName: { contains: "Collison", mode: "insensitive" },
    });
  });

  it("still supports a single-word search", async () => {
    const prisma = fakePrisma();
    await listLeads(prisma, { organisationId: "org-1", page: 1, pageSize: 25, search: "Patrick" });
    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(1);
  });

  it("paginates using page/pageSize", async () => {
    const prisma = fakePrisma();
    await listLeads(prisma, { organisationId: "org-1", page: 3, pageSize: 10 });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

describe("buildLeadWhere", () => {
  it("filters by list membership when a leadListId is given", () => {
    const where = buildLeadWhere({ organisationId: "org-1", leadListId: "list-1" });
    expect(where.leadListMemberships).toEqual({ some: { leadListId: "list-1" } });
  });

  it("matches a search term against the related company name, not just lead columns", () => {
    const where = buildLeadWhere({ organisationId: "org-1", search: "Acme" });
    expect(where.AND?.[0].OR).toContainEqual({
      company: { name: { contains: "Acme", mode: "insensitive" } },
    });
  });
});

describe("listLeadIdsMatching", () => {
  it("resolves a filter to IDs using the same predicate the table lists through", async () => {
    const prisma = fakePrisma([{ id: "lead-1" }, { id: "lead-2" }]);
    const ids = await listLeadIdsMatching(prisma, {
      organisationId: "org-1",
      search: "Acme",
      status: "ARCHIVED",
    });

    expect(ids).toEqual(["lead-1", "lead-2"]);
    const call = prisma.lead.findMany.mock.calls[0][0];
    expect(call.select).toEqual({ id: true });
    expect(call.where).toEqual(
      buildLeadWhere({ organisationId: "org-1", search: "Acme", status: "ARCHIVED" }),
    );
    // No pagination: a "select all matching" action must not silently stop at a page boundary.
    expect(call.take).toBeUndefined();
    expect(call.skip).toBeUndefined();
  });
});

describe("archiveLeads", () => {
  it("scopes the bulk update to the given organisationId, not just the lead IDs", async () => {
    const prisma = fakePrisma();
    await archiveLeads(prisma, "org-1", ["lead-1", "lead-2"]);
    expect(prisma.lead.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["lead-1", "lead-2"] }, organisationId: "org-1" },
      data: { status: "ARCHIVED" },
    });
  });
});
