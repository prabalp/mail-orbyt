import { describe, expect, it, vi } from "vitest";

const addSuppressionEntryMock = vi.fn();
vi.mock("@mail-orbyt/leads", () => ({ addSuppressionEntry: addSuppressionEntryMock }));

const { syncRepliesForOutboxItem } = await import("./reply-sync-service");

const SENT_ITEM = {
  id: "outbox-1",
  organisationId: "org-1",
  leadId: "lead-1",
  enrollmentId: "enrollment-1",
  inboxId: "inbox-1",
  providerThreadId: "thread-1",
  status: "SENT",
  subject: "Hi",
  lead: { id: "lead-1", email: "prospect@example.com" },
};

function fakePrisma(item: unknown, existingMessage: unknown = null) {
  return {
    outboxItem: { findUnique: vi.fn().mockResolvedValue(item) },
    inbox: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: "inbox-1", emailAddress: "alex@acme.example" }),
    },
    conversation: {
      upsert: vi.fn().mockImplementation(({ create }) => ({ id: "conversation-1", ...create })),
    },
    conversationMessage: {
      findUnique: vi.fn().mockResolvedValue(existingMessage),
      create: vi.fn().mockResolvedValue({}),
    },
    campaignEnrollment: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe("syncRepliesForOutboxItem", () => {
  it("does nothing for an item that isn't SENT", async () => {
    const prisma = fakePrisma({ ...SENT_ITEM, status: "SCHEDULED" });
    const fetchThread = vi.fn();
    const result = await syncRepliesForOutboxItem(prisma as never, fetchThread, "outbox-1");
    expect(result).toEqual({ newReplies: 0, conversationId: null });
    expect(fetchThread).not.toHaveBeenCalled();
  });

  it("does nothing when the thread only contains our own sent message", async () => {
    const prisma = fakePrisma(SENT_ITEM);
    const fetchThread = vi.fn().mockResolvedValue([
      {
        gmailMessageId: "msg-1",
        from: "Alex <alex@acme.example>",
        subject: "Hi",
        snippet: "Hi",
        internalDate: new Date(),
      },
    ]);
    const result = await syncRepliesForOutboxItem(prisma as never, fetchThread, "outbox-1");
    expect(result).toEqual({ newReplies: 0, conversationId: null });
    expect(prisma.campaignEnrollment.update).not.toHaveBeenCalled();
  });

  it("records a genuine reply, classifies it, and exits the enrollment", async () => {
    const prisma = fakePrisma(SENT_ITEM);
    const fetchThread = vi.fn().mockResolvedValue([
      {
        gmailMessageId: "msg-1",
        from: "Alex <alex@acme.example>",
        subject: "Hi",
        snippet: "Hi",
        internalDate: new Date(),
      },
      {
        gmailMessageId: "msg-2",
        from: "Jamie Prospect <prospect@example.com>",
        subject: "Re: Hi",
        snippet: "Not interested, please remove me.",
        internalDate: new Date(),
      },
    ]);

    const result = await syncRepliesForOutboxItem(prisma as never, fetchThread, "outbox-1");

    expect(result.newReplies).toBe(1);
    expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "INBOUND", classification: "NOT_INTERESTED" }),
      }),
    );
    expect(prisma.campaignEnrollment.update).toHaveBeenCalledWith({
      where: { id: "enrollment-1" },
      data: expect.objectContaining({ status: "EXITED", exitReason: "Lead replied" }),
    });
  });

  it("adds the lead to the suppression list when the reply is classified as an unsubscribe request", async () => {
    const prisma = fakePrisma(SENT_ITEM);
    const fetchThread = vi.fn().mockResolvedValue([
      {
        gmailMessageId: "msg-1",
        from: "Alex <alex@acme.example>",
        subject: "Hi",
        snippet: "Hi",
        internalDate: new Date(),
      },
      {
        gmailMessageId: "msg-2",
        from: "Jamie Prospect <prospect@example.com>",
        subject: "Re: Hi",
        snippet: "Please unsubscribe me from this list.",
        internalDate: new Date(),
      },
    ]);

    await syncRepliesForOutboxItem(prisma as never, fetchThread, "outbox-1");

    expect(addSuppressionEntryMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        organisationId: "org-1",
        type: "EMAIL",
        value: "prospect@example.com",
        reason: "UNSUBSCRIBE",
      }),
    );
  });

  it("does not create a duplicate ConversationMessage for an already-recorded reply", async () => {
    const prisma = fakePrisma(SENT_ITEM, { id: "existing-message" });
    const fetchThread = vi.fn().mockResolvedValue([
      {
        gmailMessageId: "msg-2",
        from: "prospect@example.com",
        subject: "Re: Hi",
        snippet: "Thanks",
        internalDate: new Date(),
      },
    ]);

    const result = await syncRepliesForOutboxItem(prisma as never, fetchThread, "outbox-1");

    expect(result.newReplies).toBe(0);
    expect(prisma.conversationMessage.create).not.toHaveBeenCalled();
    expect(prisma.campaignEnrollment.update).not.toHaveBeenCalled();
  });
});
