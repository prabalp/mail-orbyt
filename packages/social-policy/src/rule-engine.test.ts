import { describe, expect, it } from "vitest";
import { evaluateContentAgainstRules } from "./rule-engine";

function fakePrisma(rules: Array<Record<string, unknown>>) {
  return {
    socialPolicyRule: {
      findMany: async () => rules,
    },
  };
}

const rule = (overrides: Partial<Record<string, unknown>>) => ({
  id: "rule-1",
  organisationId: "org-1",
  kind: "BANNED_TOPIC",
  pattern: "crypto",
  isRegex: false,
  platform: null,
  ...overrides,
});

describe("evaluateContentAgainstRules", () => {
  it("allows content with no matching rules and no allow-list", async () => {
    const prisma = fakePrisma([rule({ pattern: "nft" })]);
    const result = await evaluateContentAgainstRules(prisma as never, "org-1", "TWITTER", "hello world");
    expect(result.verdict).toBe("ALLOW");
    expect(result.matchedRules).toEqual([]);
  });

  it("denies on a BANNED_TOPIC match, case-insensitively", async () => {
    const prisma = fakePrisma([rule({ pattern: "crypto" })]);
    const result = await evaluateContentAgainstRules(
      prisma as never,
      "org-1",
      "TWITTER",
      "Check out this new CRYPTO coin",
    );
    expect(result.verdict).toBe("DENY");
    expect(result.matchedRules).toHaveLength(1);
  });

  it("escalates on a REQUIRE_APPROVAL_KEYWORD match", async () => {
    const prisma = fakePrisma([rule({ kind: "REQUIRE_APPROVAL_KEYWORD", pattern: "refund" })]);
    const result = await evaluateContentAgainstRules(
      prisma as never,
      "org-1",
      "TWITTER",
      "happy to process your refund",
    );
    expect(result.verdict).toBe("ESCALATE");
  });

  it("a DENY match overrides an ESCALATE match evaluated after it", async () => {
    const prisma = fakePrisma([
      rule({ id: "escalate-rule", kind: "REQUIRE_APPROVAL_KEYWORD", pattern: "refund" }),
      rule({ id: "deny-rule", kind: "BANNED_TOPIC", pattern: "lawsuit" }),
    ]);
    const result = await evaluateContentAgainstRules(
      prisma as never,
      "org-1",
      "TWITTER",
      "about your refund and the pending lawsuit",
    );
    expect(result.verdict).toBe("DENY");
  });

  it("denies content matching no ALLOWED_TOPIC rule when allow-list rules exist", async () => {
    const prisma = fakePrisma([rule({ kind: "ALLOWED_TOPIC", pattern: "product update" })]);
    const result = await evaluateContentAgainstRules(prisma as never, "org-1", "TWITTER", "off-topic content");
    expect(result.verdict).toBe("DENY");
  });

  it("allows content matching an ALLOWED_TOPIC rule when allow-list rules exist", async () => {
    const prisma = fakePrisma([rule({ kind: "ALLOWED_TOPIC", pattern: "product update" })]);
    const result = await evaluateContentAgainstRules(
      prisma as never,
      "org-1",
      "TWITTER",
      "here's our latest product update",
    );
    expect(result.verdict).toBe("ALLOW");
  });

  it("treats a malformed regex rule as a non-match instead of throwing", async () => {
    const prisma = fakePrisma([rule({ isRegex: true, pattern: "(unclosed" })]);
    const result = await evaluateContentAgainstRules(prisma as never, "org-1", "TWITTER", "anything");
    expect(result.verdict).toBe("ALLOW");
  });
});
