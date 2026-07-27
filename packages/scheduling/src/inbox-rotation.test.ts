import { describe, expect, it, vi } from "vitest";
import { pickNextInbox } from "./inbox-rotation";

function fakePrisma(
  pool: { inbox: { id: string; dailySendLimit: number } }[],
  counts: Record<string, number>,
) {
  return {
    campaignInbox: { findMany: vi.fn().mockResolvedValue(pool) },
    outboxItem: {
      count: vi.fn().mockImplementation(({ where }) => Promise.resolve(counts[where.inboxId] ?? 0)),
    },
  };
}

describe("pickNextInbox", () => {
  it("returns null when the pool is empty", async () => {
    const prisma = fakePrisma([], {});
    expect(await pickNextInbox(prisma, "campaign-1")).toBeNull();
  });

  it("returns null when every inbox has hit its daily limit", async () => {
    const prisma = fakePrisma([{ inbox: { id: "inbox-1", dailySendLimit: 5 } }], { "inbox-1": 5 });
    expect(await pickNextInbox(prisma, "campaign-1")).toBeNull();
  });

  it("picks the inbox with the fewest sends today among those under their limit", async () => {
    const prisma = fakePrisma(
      [
        { inbox: { id: "inbox-1", dailySendLimit: 30 } },
        { inbox: { id: "inbox-2", dailySendLimit: 30 } },
      ],
      { "inbox-1": 10, "inbox-2": 3 },
    );
    const result = await pickNextInbox(prisma, "campaign-1");
    expect(result?.id).toBe("inbox-2");
  });

  it("skips an inbox at its limit in favor of one under its limit", async () => {
    const prisma = fakePrisma(
      [
        { inbox: { id: "inbox-1", dailySendLimit: 5 } },
        { inbox: { id: "inbox-2", dailySendLimit: 30 } },
      ],
      { "inbox-1": 5, "inbox-2": 20 },
    );
    const result = await pickNextInbox(prisma, "campaign-1");
    expect(result?.id).toBe("inbox-2");
  });

  it("only queries inboxes with CONNECTED status", async () => {
    const prisma = fakePrisma([], {});
    await pickNextInbox(prisma, "campaign-1");
    expect(prisma.campaignInbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: "campaign-1", inbox: { status: "CONNECTED" } },
      }),
    );
  });
});
