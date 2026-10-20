import { describe, expect, it, vi } from "vitest";
import { evaluateSocialAction } from "./policy-service";

function fakeRedis() {
  return {
    get: vi.fn(async () => null),
  };
}

function fakePrisma(options: {
  autonomyConfig?: Record<string, unknown> | null;
  rules?: Array<Record<string, unknown>>;
}) {
  const created: Array<Record<string, unknown>> = [];
  return {
    prisma: {
      socialAutonomyConfig: {
        findFirst: vi.fn(async () => options.autonomyConfig ?? null),
      },
      socialPolicyRule: {
        findMany: vi.fn(async () => options.rules ?? []),
      },
      socialAction: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `action-${created.length + 1}`, ...data };
          created.push(row);
          return row;
        }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    },
    created,
  };
}

const baseInput = {
  organisationId: "org-1",
  connectionId: "conn-1",
  platform: "TWITTER" as const,
  actionType: "REPLY" as const,
  content: "Thanks for the shoutout!",
  compositeConfidence: 0.95,
  isFirstTimeContact: false,
  sentiment: "positive" as const,
  triggerSource: "poll",
  generationPrompt: "prompt text",
  generationModel: "gemini-2.5-flash",
};

describe("evaluateSocialAction", () => {
  it("fails closed to ESCALATE when no SocialAutonomyConfig row exists at all", async () => {
    const { prisma, created } = fakePrisma({ autonomyConfig: null });
    const result = await evaluateSocialAction(prisma as never, fakeRedis() as never, baseInput);
    expect(result.decision).toBe("ESCALATE");
    expect(created).toHaveLength(1);
    expect(created[0]?.status).toBe("PENDING_HUMAN_APPROVAL");
  });

  it("downgrades an ALLOW to DRY_RUN when dryRunMode is on", async () => {
    const { prisma } = fakePrisma({
      autonomyConfig: {
        autonomyEnabled: true,
        dryRunMode: true,
        maxActionsPerHour: 5,
        maxActionsPerDay: 20,
        requireApprovalBelowConfidence: 0.85,
      },
    });
    const result = await evaluateSocialAction(prisma as never, fakeRedis() as never, baseInput);
    expect(result.decision).toBe("DRY_RUN");
  });

  it("allows and marks APPROVED when autonomy is on and dry-run is off", async () => {
    const { prisma, created } = fakePrisma({
      autonomyConfig: {
        autonomyEnabled: true,
        dryRunMode: false,
        maxActionsPerHour: 5,
        maxActionsPerDay: 20,
        requireApprovalBelowConfidence: 0.85,
      },
    });
    const result = await evaluateSocialAction(prisma as never, fakeRedis() as never, baseInput);
    expect(result.decision).toBe("ALLOW");
    expect(created[0]?.status).toBe("APPROVED");
  });

  it("always persists a SocialAction row even for a DENY, with the full audit fields", async () => {
    const { prisma, created } = fakePrisma({
      autonomyConfig: {
        autonomyEnabled: true,
        dryRunMode: false,
        maxActionsPerHour: 5,
        maxActionsPerDay: 20,
        requireApprovalBelowConfidence: 0.85,
      },
      rules: [
        { id: "r1", kind: "BANNED_TOPIC", pattern: "thanks", isRegex: false, platform: null },
      ],
    });
    const result = await evaluateSocialAction(prisma as never, fakeRedis() as never, baseInput);
    expect(result.decision).toBe("DENY");
    expect(created[0]?.status).toBe("REJECTED_BY_POLICY");
    expect(created[0]?.generatedContent).toBe(baseInput.content);
    expect(created[0]?.generationPrompt).toBe(baseInput.generationPrompt);
    expect(created[0]?.policyEvaluation).toBeDefined();
  });
});
