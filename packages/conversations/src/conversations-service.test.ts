import { describe, expect, it, vi } from "vitest";
import { getConversation, listConversations } from "./conversations-service";

describe("listConversations", () => {
  it("scopes the query to the given organisation", async () => {
    const prisma = { conversation: { findMany: vi.fn().mockResolvedValue([]) } };
    await listConversations(prisma, "org-1");
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organisationId: "org-1" } }),
    );
  });
});

describe("getConversation", () => {
  it("returns null for a conversation belonging to a different organisation", async () => {
    const prisma = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({ id: "c1", organisationId: "org-attacker" }),
      },
    };
    const result = await getConversation(prisma, "org-victim", "c1");
    expect(result).toBeNull();
  });

  it("returns the conversation for its owning organisation", async () => {
    const conversation = { id: "c1", organisationId: "org-1" };
    const prisma = { conversation: { findUnique: vi.fn().mockResolvedValue(conversation) } };
    const result = await getConversation(prisma, "org-1", "c1");
    expect(result).toEqual(conversation);
  });
});
