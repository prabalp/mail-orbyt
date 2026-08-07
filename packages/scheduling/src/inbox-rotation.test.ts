import { describe, expect, it, vi } from "vitest";
import { markInboxSent, pickNextInbox } from "./inbox-rotation";

const NOW = new Date("2026-07-27T12:00:00Z");

interface FakeInbox {
  id: string;
  dailySendLimit: number;
  sendCooldownUntil?: Date | null;
}

function fakePrisma(
  pool: { inbox: FakeInbox }[],
  counts: Record<string, number>,
  options: { claimable?: (id: string) => boolean } = {},
) {
  const claims: Record<string, Date> = {};
  return {
    campaignInbox: { findMany: vi.fn().mockResolvedValue(pool) },
    outboxItem: {
      count: vi.fn().mockImplementation(({ where }) => Promise.resolve(counts[where.inboxId] ?? 0)),
    },
    inbox: {
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        if (options.claimable && !options.claimable(where.id)) return Promise.resolve({ count: 0 });
        claims[where.id] = data.sendCooldownUntil;
        return Promise.resolve({ count: 1 });
      }),
      findMany: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          (where.id.in as string[]).map((id) => {
            const inbox = pool.find((entry) => entry.inbox.id === id)!.inbox;
            return { sendCooldownUntil: claims[id] ?? inbox.sendCooldownUntil ?? null };
          }),
        ),
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    claims,
  };
}

describe("pickNextInbox", () => {
  it("returns no inbox when the pool is empty", async () => {
    const prisma = fakePrisma([], {});
    expect(await pickNextInbox(prisma, "campaign-1")).toEqual({ inbox: null });
  });

  it("returns no inbox when every inbox has hit its daily limit", async () => {
    const prisma = fakePrisma([{ inbox: { id: "inbox-1", dailySendLimit: 5 } }], { "inbox-1": 5 });
    expect(await pickNextInbox(prisma, "campaign-1")).toEqual({ inbox: null });
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
    expect(result.inbox?.id).toBe("inbox-2");
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
    expect(result.inbox?.id).toBe("inbox-2");
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

  it("claims no cooldown slot at all when the cooldown is disabled", async () => {
    const prisma = fakePrisma([{ inbox: { id: "inbox-1", dailySendLimit: 30 } }], {});
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 0);
    expect(result.inbox?.id).toBe("inbox-1");
    expect(prisma.inbox.updateMany).not.toHaveBeenCalled();
  });

  it("claims the cooldown slot when picking, so the next pick sees the inbox as busy", async () => {
    const prisma = fakePrisma([{ inbox: { id: "inbox-1", dailySendLimit: 30 } }], {});
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 3);
    expect(result.inbox?.id).toBe("inbox-1");
    expect(prisma.inbox.updateMany).toHaveBeenCalledWith({
      where: {
        id: "inbox-1",
        OR: [{ sendCooldownUntil: null }, { sendCooldownUntil: { lte: NOW } }],
      },
      data: { sendCooldownUntil: new Date(NOW.getTime() + 3 * 60_000) },
    });
  });

  it("defers with availableAt when the only under-limit inbox is still cooling down", async () => {
    const coolingUntil = new Date(NOW.getTime() + 2 * 60_000);
    const prisma = fakePrisma(
      [{ inbox: { id: "inbox-1", dailySendLimit: 30, sendCooldownUntil: coolingUntil } }],
      {},
    );
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 3);
    expect(result.inbox).toBeNull();
    expect(result.availableAt?.getTime()).toBe(coolingUntil.getTime());
    expect(prisma.inbox.updateMany).not.toHaveBeenCalled();
  });

  it("still sends from a second inbox while the first is cooling down — the throttle is per inbox", async () => {
    const prisma = fakePrisma(
      [
        {
          inbox: {
            id: "inbox-1",
            dailySendLimit: 30,
            sendCooldownUntil: new Date(NOW.getTime() + 2 * 60_000),
          },
        },
        { inbox: { id: "inbox-2", dailySendLimit: 30, sendCooldownUntil: null } },
      ],
      { "inbox-1": 1, "inbox-2": 5 },
    );
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 3);
    expect(result.inbox?.id).toBe("inbox-2");
  });

  it("moves on to the next inbox when another worker wins the claim race", async () => {
    const prisma = fakePrisma(
      [
        { inbox: { id: "inbox-1", dailySendLimit: 30 } },
        { inbox: { id: "inbox-2", dailySendLimit: 30 } },
      ],
      { "inbox-1": 1, "inbox-2": 5 },
      { claimable: (id) => id !== "inbox-1" },
    );
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 3);
    expect(result.inbox?.id).toBe("inbox-2");
  });

  it("never reschedules into the past when every claim race is lost", async () => {
    const prisma = fakePrisma(
      [{ inbox: { id: "inbox-1", dailySendLimit: 30 } }],
      {},
      {
        claimable: () => false,
      },
    );
    const result = await pickNextInbox(prisma, "campaign-1", NOW, 3);
    expect(result.inbox).toBeNull();
    expect(result.availableAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("markInboxSent", () => {
  it("re-anchors the cooldown to the actual send time", async () => {
    const prisma = fakePrisma([], {});
    await markInboxSent(prisma, "inbox-1", NOW, 5);
    expect(prisma.inbox.update).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: { sendCooldownUntil: new Date(NOW.getTime() + 5 * 60_000) },
    });
  });

  it("writes nothing when the cooldown is disabled", async () => {
    const prisma = fakePrisma([], {});
    await markInboxSent(prisma, "inbox-1", NOW, 0);
    expect(prisma.inbox.update).not.toHaveBeenCalled();
  });
});
