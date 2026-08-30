import { describe, expect, it, vi } from "vitest";

const isSuppressedMock = vi.fn();
vi.mock("@mail-orbyt/leads", () => ({ isSuppressed: isSuppressedMock }));

const pickNextInboxMock = vi.fn();
const markInboxSentMock = vi.fn();
vi.mock("./inbox-rotation", () => ({
  pickNextInbox: pickNextInboxMock,
  markInboxSent: markInboxSentMock,
}));

const scheduleNextStepMock = vi.fn();
vi.mock("./enrollment-progression", () => ({
  scheduleNextStepForEnrollment: scheduleNextStepMock,
}));

const materializeStepContentMock = vi.fn();
vi.mock("./content", () => ({ materializeStepContent: materializeStepContentMock }));

const { processOutboxItem } = await import("./outbox-service");

const NOW = new Date("2026-07-27T12:00:00Z");

function fakePrisma(item: unknown) {
  return {
    outboxItem: {
      findUnique: vi.fn().mockResolvedValue(item),
      update: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...(item as object), ...data })),
    },
    campaignEnrollment: {
      update: vi.fn().mockResolvedValue({}),
    },
    campaignStep: { findUnique: vi.fn().mockResolvedValue(null) },
    signature: { findFirst: vi.fn().mockResolvedValue(null) },
    inbox: { update: vi.fn().mockResolvedValue({}) },
    trackingDomain: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}

const BASE_ITEM = {
  id: "outbox-1",
  organisationId: "org-1",
  campaignId: "campaign-1",
  leadId: "lead-1",
  enrollmentId: "enrollment-1",
  status: "SCHEDULED",
  attempts: 0,
  subject: null,
  body: null,
  scheduledFor: NOW,
  lead: { id: "lead-1", email: "prospect@example.com", firstName: "Jamie" },
  campaign: {
    id: "campaign-1",
    status: "ACTIVE",
    timezone: "UTC",
    sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    sendingWindowStartMinute: 0,
    sendingWindowEndMinute: 1439,
    inboxCooldownMinutes: 3,
  },
  campaignStep: { id: "step-1", orderIndex: 0 },
  enrollment: { id: "enrollment-1" },
};

const BASE_DEPS = {
  resolveAiGenerator: async () => undefined,
  sendEmail: vi.fn(),
  getSenderContext: vi
    .fn()
    .mockResolvedValue({ senderName: "Alex", senderCompanyName: "Mail Orbyt" }),
  emergencyStop: false,
  now: NOW,
};

describe("processOutboxItem", () => {
  it("returns null for a nonexistent item", async () => {
    const prisma = fakePrisma(null);
    expect(await processOutboxItem(prisma, BASE_DEPS, "missing")).toBeNull();
  });

  it("is a no-op for an item that isn't SCHEDULED (idempotent retrigger)", async () => {
    const prisma = fakePrisma({ ...BASE_ITEM, status: "SENT" });
    const result = await processOutboxItem(prisma, BASE_DEPS, "outbox-1");
    expect(result?.status).toBe("SENT");
    expect(BASE_DEPS.sendEmail).not.toHaveBeenCalled();
  });

  it("does not send when emergency stop is active", async () => {
    const prisma = fakePrisma({ ...BASE_ITEM });
    const sendEmail = vi.fn();
    const result = await processOutboxItem(
      prisma,
      { ...BASE_DEPS, sendEmail, emergencyStop: true },
      "outbox-1",
    );
    expect(result?.status).toBe("SCHEDULED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // Pausing must stop sends that were already queued, not only stop new ones
  // being scheduled — the dispatcher hands over every due item regardless of
  // campaign, so this check is the only thing enforcing it.
  it("does not send for a paused campaign, and leaves the item SCHEDULED for the resume", async () => {
    const prisma = fakePrisma({
      ...BASE_ITEM,
      campaign: { ...BASE_ITEM.campaign, status: "PAUSED" },
    });
    const sendEmail = vi.fn();
    const result = await processOutboxItem(prisma, { ...BASE_DEPS, sendEmail }, "outbox-1");
    expect(result?.status).toBe("SCHEDULED");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.outboxItem.update).not.toHaveBeenCalled();
  });

  it("marks the item SKIPPED_SUPPRESSED and exits the enrollment when the lead is suppressed", async () => {
    isSuppressedMock.mockResolvedValueOnce(true);
    const prisma = fakePrisma({ ...BASE_ITEM });
    const result = await processOutboxItem(prisma, BASE_DEPS, "outbox-1");
    expect(result?.status).toBe("SKIPPED_SUPPRESSED");
    expect(prisma.campaignEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUPPRESSED" }) }),
    );
  });

  it("defers the item (reschedules, stays SCHEDULED) when no inbox is available", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({ inbox: null });
    const prisma = fakePrisma({ ...BASE_ITEM });
    const result = await processOutboxItem(prisma, BASE_DEPS, "outbox-1");
    expect(result?.status).toBe("SCHEDULED");
    expect(result?.scheduledFor.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("reschedules to the moment the inbox cooldown lifts, rather than the flat no-inbox deferral", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    const availableAt = new Date(NOW.getTime() + 3 * 60_000);
    pickNextInboxMock.mockResolvedValueOnce({ inbox: null, availableAt });
    const prisma = fakePrisma({ ...BASE_ITEM });
    const result = await processOutboxItem(prisma, BASE_DEPS, "outbox-1");
    expect(result?.status).toBe("SCHEDULED");
    expect(result?.scheduledFor.getTime()).toBe(availableAt.getTime());
    expect(BASE_DEPS.sendEmail).not.toHaveBeenCalled();
  });

  it("passes the campaign's configured cooldown to inbox selection and re-anchors it to the real send time", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({ subject: "Hi", body: "Body" });
    const sendEmail = vi.fn().mockResolvedValueOnce({ messageId: "m", threadId: "t" });

    const prisma = fakePrisma({
      ...BASE_ITEM,
      campaign: { ...BASE_ITEM.campaign, inboxCooldownMinutes: 5 },
    });
    await processOutboxItem(prisma, { ...BASE_DEPS, sendEmail }, "outbox-1");

    expect(pickNextInboxMock).toHaveBeenCalledWith(prisma, "campaign-1", NOW, 5);
    expect(markInboxSentMock).toHaveBeenCalledWith(prisma, "inbox-1", NOW, 5);
  });

  it("sends successfully: materializes content, sends, marks SENT, advances the enrollment, schedules the next step", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({
      subject: "Hi",
      body: "Would you be open to a call?",
    });
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce({ messageId: "gmail-msg-1", threadId: "gmail-thread-1" });

    const prisma = fakePrisma({ ...BASE_ITEM });
    const result = await processOutboxItem(prisma, { ...BASE_DEPS, sendEmail }, "outbox-1");

    expect(sendEmail).toHaveBeenCalledWith("inbox-1", {
      to: "prospect@example.com",
      subject: "Hi",
      body: "Would you be open to a call?",
    });
    expect(result?.status).toBe("SENT");
    expect(result?.providerMessageId).toBe("gmail-msg-1");
    expect(prisma.campaignEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE", currentStepIndex: { increment: 1 } }),
      }),
    );
    expect(scheduleNextStepMock).toHaveBeenCalledWith(prisma, "enrollment-1");
  });

  it("uses the campaign's own prompt in place of the organisation's", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({ subject: "Hi", body: "Body" });
    const sendEmail = vi.fn().mockResolvedValueOnce({ messageId: "m", threadId: "t" });

    const prisma = fakePrisma({
      ...BASE_ITEM,
      campaign: { ...BASE_ITEM.campaign, emailPromptInstructions: "Blunt and technical." },
    });
    await processOutboxItem(
      prisma,
      {
        ...BASE_DEPS,
        sendEmail,
        getSenderContext: vi.fn().mockResolvedValue({
          senderCompanyName: "Mail Orbyt",
          campaignPrompt: "Warm and chatty.",
        }),
      },
      "outbox-1",
    );

    expect(materializeStepContentMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ campaignPrompt: "Blunt and technical." }),
    );
  });

  it("falls back to the organisation's prompt when the campaign has none", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({ subject: "Hi", body: "Body" });
    const sendEmail = vi.fn().mockResolvedValueOnce({ messageId: "m", threadId: "t" });

    // Whitespace-only is treated as "not set" — an operator clearing the field
    // shouldn't leave a blank instruction block shadowing the org default.
    const prisma = fakePrisma({
      ...BASE_ITEM,
      campaign: { ...BASE_ITEM.campaign, emailPromptInstructions: "   " },
    });
    await processOutboxItem(
      prisma,
      {
        ...BASE_DEPS,
        sendEmail,
        getSenderContext: vi.fn().mockResolvedValue({
          senderCompanyName: "Mail Orbyt",
          campaignPrompt: "Warm and chatty.",
        }),
      },
      "outbox-1",
    );

    expect(materializeStepContentMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ campaignPrompt: "Warm and chatty." }),
    );
  });

  it("retries (stays SCHEDULED) on a send failure below the max attempt count", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({ subject: "Hi", body: "Body" });
    const sendEmail = vi.fn().mockRejectedValueOnce(new Error("network error"));

    const prisma = fakePrisma({ ...BASE_ITEM, attempts: 0 });
    const result = await processOutboxItem(prisma, { ...BASE_DEPS, sendEmail }, "outbox-1");

    expect(result?.status).toBe("SCHEDULED");
    expect(result?.attempts).toBe(1);
    expect(result?.lastError).toBe("network error");
  });

  it("marks the item FAILED (terminal) once max attempts is reached", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    pickNextInboxMock.mockResolvedValueOnce({
      inbox: { id: "inbox-1", emailAddress: "alex@acme.example" },
    });
    materializeStepContentMock.mockResolvedValueOnce({ subject: "Hi", body: "Body" });
    const sendEmail = vi.fn().mockRejectedValueOnce(new Error("network error"));

    const prisma = fakePrisma({ ...BASE_ITEM, attempts: 2 });
    const result = await processOutboxItem(prisma, { ...BASE_DEPS, sendEmail }, "outbox-1");

    expect(result?.status).toBe("FAILED");
    expect(result?.attempts).toBe(3);
  });

  it("marks the item FAILED immediately when the lead has no email address", async () => {
    isSuppressedMock.mockResolvedValueOnce(false);
    const prisma = fakePrisma({ ...BASE_ITEM, lead: { id: "lead-1", email: null } });
    const result = await processOutboxItem(prisma, BASE_DEPS, "outbox-1");
    expect(result?.status).toBe("FAILED");
  });
});
