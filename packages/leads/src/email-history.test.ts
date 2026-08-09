import { describe, expect, it, vi } from "vitest";
import { listLeadEmailHistory } from "./email-history";

function fakePrisma(items: unknown[] = []) {
  return { outboxItem: { findMany: vi.fn().mockResolvedValue(items) } };
}

const sentItem = {
  id: "outbox-1",
  status: "SENT",
  subject: "Quick question about onboarding",
  body: "Hi Ada,\n\n…",
  sentAt: new Date("2026-08-01T09:00:00Z"),
  scheduledFor: new Date("2026-08-01T08:55:00Z"),
  lastError: null,
  attempts: 1,
  campaign: { id: "camp-1", name: "Q3 CTOs" },
  campaignStep: { id: "step-1", orderIndex: 0, stepType: "INITIAL" },
  inbox: { id: "inbox-1", emailAddress: "sam@acme.com" },
  providerMessageId: "msg-1",
  providerThreadId: "thread-1",
};

describe("listLeadEmailHistory", () => {
  it("scopes the query to both the organisation and the lead", async () => {
    const prisma = fakePrisma();
    await listLeadEmailHistory(prisma, "org-1", "lead-1");
    expect(prisma.outboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: "org-1", leadId: "lead-1" } }),
    );
  });

  it("returns the campaign, step, inbox and timestamps for each email", async () => {
    const prisma = fakePrisma([sentItem]);
    const [entry] = await listLeadEmailHistory(prisma, "org-1", "lead-1");

    expect(entry.campaign).toEqual({ id: "camp-1", name: "Q3 CTOs" });
    expect(entry.step).toEqual({ id: "step-1", orderIndex: 0, stepType: "INITIAL" });
    expect(entry.inbox).toEqual({ id: "inbox-1", emailAddress: "sam@acme.com" });
    expect(entry.sentAt).toEqual(new Date("2026-08-01T09:00:00Z"));
    expect(entry.subject).toBe("Quick question about onboarding");
  });

  it("falls back to scheduledFor for ordering so unsent items aren't stranded at one end", async () => {
    const prisma = fakePrisma();
    await listLeadEmailHistory(prisma, "org-1", "lead-1");
    expect(prisma.outboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sentAt: "desc" }, { scheduledFor: "desc" }],
      }),
    );
  });

  it("includes emails that never left — failures are part of the record", async () => {
    const failed = {
      ...sentItem,
      id: "outbox-2",
      status: "FAILED",
      sentAt: null,
      lastError: "Inbox disconnected",
    };
    const prisma = fakePrisma([failed]);
    const [entry] = await listLeadEmailHistory(prisma, "org-1", "lead-1");
    expect(entry.status).toBe("FAILED");
    expect(entry.sentAt).toBeNull();
    expect(entry.lastError).toBe("Inbox disconnected");
  });
});
