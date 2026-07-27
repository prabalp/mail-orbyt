import { describe, expect, it, vi } from "vitest";
import {
  getCampaignMetricsBreakdown,
  getQualifiedMeetingRate,
  getQualifiedMeetingsBooked,
  getReplyRate,
  getUniqueProspectsContacted,
} from "./metrics-service";

function fakePrisma(options: {
  sentLeadIds?: string[];
  qualifiedMeetingsCount?: number;
  repliedConversationIds?: string[];
  campaigns?: { id: string; name: string }[];
}) {
  return {
    outboxItem: {
      findMany: vi
        .fn()
        .mockResolvedValue((options.sentLeadIds ?? []).map((leadId) => ({ leadId }))),
    },
    meeting: { count: vi.fn().mockResolvedValue(options.qualifiedMeetingsCount ?? 0) },
    conversationMessage: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          (options.repliedConversationIds ?? []).map((conversationId) => ({ conversationId })),
        ),
    },
    campaign: { findMany: vi.fn().mockResolvedValue(options.campaigns ?? []) },
  };
}

describe("getUniqueProspectsContacted", () => {
  it("counts distinct leads sent to", async () => {
    const prisma = fakePrisma({ sentLeadIds: ["lead-1", "lead-2"] });
    const result = await getUniqueProspectsContacted(prisma, { organisationId: "org-1" });
    expect(result).toBe(2);
  });

  it("only queries SENT items for the given organisation", async () => {
    const prisma = fakePrisma({ sentLeadIds: [] });
    await getUniqueProspectsContacted(prisma, { organisationId: "org-1" });
    expect(prisma.outboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organisationId: "org-1", status: "SENT" }),
      }),
    );
  });
});

describe("getQualifiedMeetingsBooked", () => {
  it("excludes cancelled meetings and requires qualified=true", async () => {
    const prisma = fakePrisma({ qualifiedMeetingsCount: 3 });
    const result = await getQualifiedMeetingsBooked(prisma, { organisationId: "org-1" });
    expect(result).toBe(3);
    expect(prisma.meeting.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ qualified: true, status: { not: "CANCELLED" } }),
      }),
    );
  });
});

describe("getQualifiedMeetingRate", () => {
  it("computes booked / contacted", async () => {
    const prisma = fakePrisma({
      sentLeadIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
      qualifiedMeetingsCount: 1,
    });
    const result = await getQualifiedMeetingRate(prisma, { organisationId: "org-1" });
    expect(result).toEqual({ uniqueProspectsContacted: 4, qualifiedMeetingsBooked: 1, rate: 0.25 });
  });

  it("returns a null rate (not zero) when no prospects have been contacted", async () => {
    const prisma = fakePrisma({ sentLeadIds: [], qualifiedMeetingsCount: 0 });
    const result = await getQualifiedMeetingRate(prisma, { organisationId: "org-1" });
    expect(result.rate).toBeNull();
  });
});

describe("getReplyRate", () => {
  it("returns null when nobody has been contacted", async () => {
    const prisma = fakePrisma({ sentLeadIds: [] });
    expect(await getReplyRate(prisma, { organisationId: "org-1" })).toBeNull();
  });

  it("computes replied conversations / contacted leads", async () => {
    const prisma = fakePrisma({
      sentLeadIds: ["lead-1", "lead-2", "lead-3", "lead-4"],
      repliedConversationIds: ["conv-1"],
    });
    const result = await getReplyRate(prisma, { organisationId: "org-1" });
    expect(result).toBe(0.25);
  });
});

describe("getCampaignMetricsBreakdown", () => {
  it("returns one row per campaign", async () => {
    const prisma = fakePrisma({ campaigns: [{ id: "c1", name: "Campaign One" }] });
    const result = await getCampaignMetricsBreakdown(prisma, "org-1");
    expect(result).toEqual([
      {
        campaignId: "c1",
        campaignName: "Campaign One",
        uniqueProspectsContacted: 0,
        qualifiedMeetingsBooked: 0,
        rate: null,
      },
    ]);
  });
});
