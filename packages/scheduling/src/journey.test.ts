import { describe, expect, it, vi } from "vitest";
import {
  applyJourneyOutcome,
  JOURNEY_MAX_NODE_VISITS,
  routeJourneyReply,
  journeyStateAfterSend,
  scheduleJourneyStep,
} from "./journey";

const DAY_MS = 24 * 60 * 60 * 1000;

const CAMPAIGN = {
  organisationId: "org-1",
  timezone: "UTC",
  sendingDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  sendingWindowStartMinute: 0,
  sendingWindowEndMinute: 1440,
};

const NODES: Record<string, { nodeKey: string; isStart: boolean; edges: unknown }> = {
  intro: {
    nodeKey: "intro",
    isStart: true,
    edges: {
      no_reply: { to: "bump", afterDays: 3 },
      opened_no_reply: { to: "book" },
      interested: { to: "book", when: "wants to talk" },
      replied: { to: "END" },
    },
  },
  bump: { nodeKey: "bump", isStart: false, edges: { no_reply: { to: "intro", afterDays: 1 } } },
  book: { nodeKey: "book", isStart: false, edges: null },
};

function fakePrisma(enrollment: Record<string, unknown>) {
  const state = { ...enrollment };
  return {
    state,
    campaignEnrollment: {
      findUnique: vi.fn().mockImplementation(async () => ({
        ...state,
        lead: { firstName: "Jamie", title: "CTO" },
        campaign: { ...CAMPAIGN, routingMode: "JOURNEY" },
      })),
      update: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(state, data);
        return state;
      }),
    },
    campaignStep: { findFirst: vi.fn().mockResolvedValue({ id: "step-1" }) },
    outboxItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ openCount: 0 }),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: "outbox-new", ...data })),
    },
    leadImportedEmail: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ where }) => NODES[where.leadId_nodeKey.nodeKey] ?? null),
      findFirst: vi.fn().mockResolvedValue(NODES.intro),
    },
    enrollmentRoutingDecision: { create: vi.fn().mockResolvedValue({}) },
  };
}

const BASE = {
  id: "e1",
  campaignId: "c1",
  leadId: "l1",
  status: "ACTIVE",
  enrolledAt: new Date("2026-01-01T00:00:00Z"),
  currentNodeKey: "intro",
  nextNodeKey: null,
  nextDueAt: null,
  nextDecisionAt: null,
  sendCount: 1,
  visitCounts: { intro: 1 },
};

describe("scheduleJourneyStep", () => {
  it("schedules the start node for a fresh enrollment", async () => {
    const prisma = fakePrisma({
      ...BASE,
      status: "PENDING",
      currentNodeKey: null,
      sendCount: 0,
      visitCounts: {},
    });
    const item = await scheduleJourneyStep(prisma as never, "e1");
    expect(item).toMatchObject({ nodeKey: "intro", sendNo: 0, campaignStepId: "step-1" });
  });

  it("exits the enrollment when the lead has no start email", async () => {
    const prisma = fakePrisma({ ...BASE, status: "PENDING", currentNodeKey: null, sendCount: 0 });
    prisma.leadImportedEmail.findFirst.mockResolvedValue(null);
    expect(await scheduleJourneyStep(prisma as never, "e1")).toBeNull();
    expect(prisma.state.status).toBe("EXITED");
  });

  it("waits while the no-reply timer has not fired", async () => {
    const prisma = fakePrisma({ ...BASE, nextDecisionAt: new Date(Date.now() + DAY_MS) });
    expect(await scheduleJourneyStep(prisma as never, "e1")).toBeNull();
    expect(prisma.outboxItem.create).not.toHaveBeenCalled();
  });

  it("routes by no_reply once the timer fires and schedules the next node", async () => {
    const prisma = fakePrisma({ ...BASE, nextDecisionAt: new Date(Date.now() - 1000) });
    const item = await scheduleJourneyStep(prisma as never, "e1");
    expect(item).toMatchObject({ nodeKey: "bump", sendNo: 1 });
    expect(prisma.enrollmentRoutingDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ trigger: "TIMEOUT", outcome: "no_reply", toNodeKey: "bump" }),
    });
  });
});

describe("applyJourneyOutcome", () => {
  it("follows a reply edge, honouring its delay from now", async () => {
    const prisma = fakePrisma(BASE);
    const now = new Date("2026-02-01T00:00:00Z");
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "REPLY",
      outcome: "interested",
      source: "RULE",
      now,
    });
    expect(result).toEqual({ routed: true, toNodeKey: "book", ended: false });
    expect(prisma.state.nextNodeKey).toBe("book");
    expect(prisma.state.nextDueAt).toEqual(now);
  });

  it("falls back to the generic replied edge, and END completes the enrollment", async () => {
    const prisma = fakePrisma(BASE);
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "REPLY",
      outcome: "out_of_office",
      source: "RULE",
    });
    expect(result).toEqual({ routed: true, toNodeKey: null, ended: true });
    expect(prisma.state.status).toBe("COMPLETED");
  });

  it("does not route a reply that has no matching edge, leaving the enrollment untouched", async () => {
    const prisma = fakePrisma({ ...BASE, currentNodeKey: "bump" });
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "REPLY",
      outcome: "interested",
      source: "RULE",
    });
    expect(result).toEqual({ routed: false });
    expect(prisma.campaignEnrollment.update).not.toHaveBeenCalled();
  });

  it("ends the journey instead of looping past the revisit cap", async () => {
    const prisma = fakePrisma({
      ...BASE,
      currentNodeKey: "bump",
      visitCounts: { intro: JOURNEY_MAX_NODE_VISITS, bump: 1 },
    });
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "TIMEOUT",
      outcome: "no_reply",
      source: "RULE",
      delayElapsed: true,
    });
    expect(result).toEqual({ routed: true, toNodeKey: null, ended: true });
  });

  it("ends the journey on a timeout when the node has no no_reply edge", async () => {
    const prisma = fakePrisma({ ...BASE, currentNodeKey: "book" });
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "TIMEOUT",
      outcome: "no_reply",
      source: "RULE",
      delayElapsed: true,
    });
    expect(result).toMatchObject({ routed: true, ended: true });
  });
});

describe("journeyStateAfterSend", () => {
  it("arms the no-reply timer from the node's edge and counts the visit", async () => {
    const prisma = fakePrisma({ ...BASE, currentNodeKey: null, visitCounts: {} });
    const sentAt = new Date("2026-03-01T00:00:00Z");
    const state = await journeyStateAfterSend(prisma as never, "e1", "intro", sentAt);
    expect(state).toMatchObject({
      currentNodeKey: "intro",
      nextNodeKey: null,
      sendCount: { increment: 1 },
      visitCounts: { intro: 1 },
    });
    expect(state.nextDecisionAt).toEqual(new Date(sentAt.getTime() + 3 * DAY_MS));
  });
});

describe("opened_no_reply", () => {
  it("routes silence after an opened email down the opened_no_reply edge", async () => {
    const prisma = fakePrisma({ ...BASE, nextDecisionAt: new Date(Date.now() - 1000) });
    prisma.outboxItem.findFirst.mockResolvedValue({ openCount: 2 });
    const item = await scheduleJourneyStep(prisma as never, "e1");
    expect(item).toMatchObject({ nodeKey: "book" });
    expect(prisma.enrollmentRoutingDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "opened_no_reply" }),
    });
  });
});

describe("routeJourneyReply", () => {
  const reply = {
    classification: "UNCLASSIFIED",
    replySubject: "Re: Hi",
    replySnippet: "tell me more",
  };

  it("lets the decider pick among the node's reply outcomes and logs it as DECIDER", async () => {
    const prisma = fakePrisma(BASE);
    const decide = vi.fn().mockResolvedValue({ outcome: "interested", confidence: 0.91 });
    const result = await routeJourneyReply(prisma as never, "e1", {
      ...reply,
      decider: { decide },
    });
    expect(result).toMatchObject({ routed: true, toNodeKey: "book" });

    const input = decide.mock.calls[0]?.[0];
    // Timer outcomes are never offered as reply meanings; edge `when` text is passed through.
    expect(Object.keys(input.options)).toEqual(["interested", "replied"]);
    expect(input.options.interested).toBe("wants to talk");
    expect(input.state.reply).toEqual({ subject: "Re: Hi", text: "tell me more" });
    expect(prisma.enrollmentRoutingDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "DECIDER", outcome: "interested" }),
    });
  });

  it("falls back to the keyword classification when the decider has no answer", async () => {
    const prisma = fakePrisma(BASE);
    const decide = vi.fn().mockResolvedValue(null);
    const result = await routeJourneyReply(prisma as never, "e1", {
      ...reply,
      classification: "INTERESTED",
      decider: { decide },
    });
    expect(result).toMatchObject({ routed: true, toNodeKey: "book" });
    expect(prisma.enrollmentRoutingDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "RULE", outcome: "interested" }),
    });
  });

  it("uses the keyword rules when no decider is configured", async () => {
    const prisma = fakePrisma(BASE);
    const result = await routeJourneyReply(prisma as never, "e1", reply);
    expect(result).toMatchObject({ routed: true, ended: true });
  });
});

describe("campaign-level graph", () => {
  const graph = {
    start: "welcome",
    nodes: [
      { key: "welcome", label: "Welcome", subject: "Hi", body: "Hello", x: 0, y: 0 },
      { key: "bump", label: "Bump", subject: "Bump", body: "Checking in", x: 0, y: 0 },
    ],
    edges: [{ from: "welcome", outcome: "no_reply", to: "bump", afterDays: 2 }],
    variables: {},
  };

  it("starts at the graph's start node without any imported emails", async () => {
    const prisma = fakePrisma({ ...BASE, status: "PENDING", currentNodeKey: null, sendCount: 0 });
    const original = prisma.campaignEnrollment.findUnique.getMockImplementation();
    prisma.campaignEnrollment.findUnique.mockImplementation(async (args) => ({
      ...(await original?.(args)),
      campaign: { ...CAMPAIGN, routingMode: "JOURNEY", journeyGraph: graph },
    }));
    prisma.leadImportedEmail.findFirst.mockResolvedValue(null);
    const item = await scheduleJourneyStep(prisma as never, "e1");
    expect(item).toMatchObject({ nodeKey: "welcome" });
    expect(prisma.leadImportedEmail.findFirst).not.toHaveBeenCalled();
  });

  it("routes edges from the graph, not the lead's imports", async () => {
    const prisma = fakePrisma({ ...BASE, currentNodeKey: "welcome" });
    const original = prisma.campaignEnrollment.findUnique.getMockImplementation();
    prisma.campaignEnrollment.findUnique.mockImplementation(async (args) => ({
      ...(await original?.(args)),
      campaign: { ...CAMPAIGN, routingMode: "JOURNEY", journeyGraph: graph },
    }));
    const result = await applyJourneyOutcome(prisma as never, "e1", {
      trigger: "TIMEOUT",
      outcome: "no_reply",
      source: "RULE",
      delayElapsed: true,
    });
    expect(result).toEqual({ routed: true, toNodeKey: "bump", ended: false });
    expect(prisma.leadImportedEmail.findUnique).not.toHaveBeenCalled();
  });
});
