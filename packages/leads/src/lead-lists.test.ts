import { describe, expect, it, vi } from "vitest";
import { addLeadsToList, createOrGetLeadList, deleteLeadList, listLeadLists } from "./lead-lists";

function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    leadList: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: "list-new", ...data })),
      delete: vi.fn().mockResolvedValue({}),
      ...(overrides.leadList as object),
    },
    leadListMembership: {
      groupBy: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      ...(overrides.leadListMembership as object),
    },
  };
}

describe("createOrGetLeadList", () => {
  it("reuses an existing list of the same name instead of failing on the unique constraint", async () => {
    const prisma = fakePrisma({
      leadList: {
        findUnique: vi.fn().mockResolvedValue({ id: "list-1", name: "Q3 CTOs" }),
      },
    });
    const list = await createOrGetLeadList(prisma, "org-1", "Q3 CTOs");
    expect(list.id).toBe("list-1");
    expect(prisma.leadList.create).not.toHaveBeenCalled();
  });

  it("trims the name before lookup and creation", async () => {
    const prisma = fakePrisma();
    await createOrGetLeadList(prisma, "org-1", "  Q3 CTOs  ");
    expect(prisma.leadList.findUnique).toHaveBeenCalledWith({
      where: { organisationId_name: { organisationId: "org-1", name: "Q3 CTOs" } },
    });
    expect(prisma.leadList.create).toHaveBeenCalledWith({
      data: { organisationId: "org-1", name: "Q3 CTOs", description: null },
    });
  });
});

describe("addLeadsToList", () => {
  it("skips duplicates so a retried import job doesn't fail on rows it already added", async () => {
    const prisma = fakePrisma({
      leadListMembership: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    });
    const added = await addLeadsToList(prisma, "list-1", ["lead-1", "lead-2"]);
    expect(added).toBe(2);
    expect(prisma.leadListMembership.createMany).toHaveBeenCalledWith({
      data: [
        { leadListId: "list-1", leadId: "lead-1" },
        { leadListId: "list-1", leadId: "lead-2" },
      ],
      skipDuplicates: true,
    });
  });

  it("does not issue a query for an empty set of leads", async () => {
    const prisma = fakePrisma();
    expect(await addLeadsToList(prisma, "list-1", [])).toBe(0);
    expect(prisma.leadListMembership.createMany).not.toHaveBeenCalled();
  });
});

describe("listLeadLists", () => {
  it("attaches membership counts, defaulting an empty list to 0 rather than omitting it", async () => {
    const prisma = fakePrisma({
      leadList: {
        findMany: vi.fn().mockResolvedValue([
          { id: "list-1", name: "A" },
          { id: "list-2", name: "B" },
        ]),
      },
      leadListMembership: {
        groupBy: vi.fn().mockResolvedValue([{ leadListId: "list-1", _count: { _all: 12 } }]),
      },
    });
    const lists = await listLeadLists(prisma, "org-1");
    expect(lists).toEqual([
      { id: "list-1", name: "A", leadCount: 12 },
      { id: "list-2", name: "B", leadCount: 0 },
    ]);
  });

  it("skips the count query entirely when there are no lists", async () => {
    const prisma = fakePrisma();
    expect(await listLeadLists(prisma, "org-1")).toEqual([]);
    expect(prisma.leadListMembership.groupBy).not.toHaveBeenCalled();
  });
});

describe("deleteLeadList", () => {
  it("refuses to delete a list belonging to another organisation", async () => {
    const prisma = fakePrisma({
      leadList: {
        findUnique: vi.fn().mockResolvedValue({ id: "list-1", organisationId: "org-attacker" }),
      },
    });
    expect(await deleteLeadList(prisma, "org-victim", "list-1")).toBe(false);
    expect(prisma.leadList.delete).not.toHaveBeenCalled();
  });
});
