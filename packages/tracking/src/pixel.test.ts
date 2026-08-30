import { describe, expect, it, vi } from "vitest";
import { buildPixelImgTag, recordEmailOpen } from "./pixel";

describe("buildPixelImgTag", () => {
  it("builds a hidden 1x1 img tag pointing at the org's domain", () => {
    const tag = buildPixelImgTag("track.acme.example", "outbox123");
    expect(tag).toBe(
      '<img src="https://track.acme.example/o/outbox123.gif" width="1" height="1" alt="" style="display:none" border="0">',
    );
  });
});

describe("recordEmailOpen", () => {
  function fakePrisma(item: { organisationId: string; firstOpenedAt: Date | null } | null) {
    return {
      outboxItem: {
        findUnique: vi.fn().mockResolvedValue(item),
        update: vi.fn().mockResolvedValue(undefined),
      },
      emailOpenEvent: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  it("no-ops for an unknown outbox item id", async () => {
    const prisma = fakePrisma(null);
    await recordEmailOpen(prisma as never, "missing", {});
    expect(prisma.emailOpenEvent.create).not.toHaveBeenCalled();
    expect(prisma.outboxItem.update).not.toHaveBeenCalled();
  });

  it("logs an event and increments openCount, setting firstOpenedAt on first open", async () => {
    const prisma = fakePrisma({ organisationId: "org1", firstOpenedAt: null });
    await recordEmailOpen(prisma as never, "item1", { ipAddress: "1.2.3.4", userAgent: "test-ua" });

    expect(prisma.emailOpenEvent.create).toHaveBeenCalledWith({
      data: {
        outboxItemId: "item1",
        organisationId: "org1",
        ipAddress: "1.2.3.4",
        userAgent: "test-ua",
      },
    });
    const updateCall = prisma.outboxItem.update.mock.calls[0][0];
    expect(updateCall.data.openCount).toEqual({ increment: 1 });
    expect(updateCall.data.firstOpenedAt).toBeInstanceOf(Date);
  });

  it("keeps the original firstOpenedAt on a repeat open", async () => {
    const original = new Date("2026-01-01T00:00:00Z");
    const prisma = fakePrisma({ organisationId: "org1", firstOpenedAt: original });
    await recordEmailOpen(prisma as never, "item1", {});

    const updateCall = prisma.outboxItem.update.mock.calls[0][0];
    expect(updateCall.data.firstOpenedAt).toBe(original);
  });
});
