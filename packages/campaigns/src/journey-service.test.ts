import { describe, expect, it, vi } from "vitest";
import { getJourneyGraph, InvalidJourneyGraphError, saveJourneyGraph } from "./journey-service";

const GRAPH = {
  start: "a",
  nodes: [
    { key: "a", label: "A", subject: "s", body: "b", x: 0, y: 0 },
    { key: "b", label: "B", subject: "s", body: "b", x: 0, y: 0 },
  ],
  edges: [{ from: "a", outcome: "no_reply", to: "b" }],
  variables: {},
};

function fake(campaign: unknown, live: unknown[] = []) {
  return {
    campaign: {
      findUnique: vi.fn().mockResolvedValue(campaign),
      update: vi.fn().mockResolvedValue({}),
    },
    campaignEnrollment: { findMany: vi.fn().mockResolvedValue(live) },
  };
}

describe("saveJourneyGraph", () => {
  const journey = { id: "c1", organisationId: "org", routingMode: "JOURNEY" };

  it("saves a valid graph", async () => {
    const prisma = fake(journey);
    expect(await saveJourneyGraph(prisma as never, "org", "c1", GRAPH)).toMatchObject({
      start: "a",
    });
    expect(prisma.campaign.update).toHaveBeenCalled();
  });

  it("returns null for another organisation's campaign", async () => {
    expect(
      await saveJourneyGraph(
        fake({ ...journey, organisationId: "other" }) as never,
        "org",
        "c1",
        GRAPH,
      ),
    ).toBeNull();
  });

  it("rejects a linear campaign and an invalid graph", async () => {
    await expect(
      saveJourneyGraph(fake({ ...journey, routingMode: "LINEAR" }) as never, "org", "c1", GRAPH),
    ).rejects.toBeInstanceOf(InvalidJourneyGraphError);
    await expect(
      saveJourneyGraph(fake(journey) as never, "org", "c1", { ...GRAPH, start: "zzz" }),
    ).rejects.toBeInstanceOf(InvalidJourneyGraphError);
  });

  it("refuses to drop an email a live lead is on", async () => {
    const prisma = fake(journey, [{ currentNodeKey: "gone", nextNodeKey: null }]);
    await expect(saveJourneyGraph(prisma as never, "org", "c1", GRAPH)).rejects.toThrow(/gone/);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });
});

describe("getJourneyGraph", () => {
  it("distinguishes not-found from no-graph-yet", async () => {
    expect(await getJourneyGraph(fake(null) as never, "org", "c1")).toEqual({
      found: false,
      graph: null,
    });
    expect(
      await getJourneyGraph(
        fake({ organisationId: "org", journeyGraph: null }) as never,
        "org",
        "c1",
      ),
    ).toEqual({ found: true, graph: null });
  });
});
