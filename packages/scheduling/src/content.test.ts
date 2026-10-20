import { describe, expect, it, vi } from "vitest";

const generateEmailMock = vi.fn();
vi.mock("@mail-orbyt/email-generation", () => ({ generateEmail: generateEmailMock }));

const createResearchSnapshotMock = vi.fn();
const getLatestPageTextMock = vi.fn();
vi.mock("@mail-orbyt/research", () => ({
  createResearchSnapshot: createResearchSnapshotMock,
  getLatestPageText: getLatestPageTextMock,
}));

const { materializeStepContent, AiNotConfiguredForStepError, MissingImportedEmailError } =
  await import("./content");

const LEAD = { id: "lead-1", firstName: "Jamie", lastName: "Rivera", title: "VP Sales" };

describe("materializeStepContent", () => {
  it("wraps an imported body with a greeting and signature and does not call AI", async () => {
    const prisma = {
      leadImportedEmail: {
        findUnique: vi.fn().mockResolvedValue({
          subject: "Idea for {{firstName}}",
          body: "I noticed the team is expanding.",
        }),
      },
    };
    const result = await materializeStepContent(prisma as never, {
      organisationId: "org-1",
      lead: LEAD,
      step: {
        orderIndex: 0,
        stepType: "INITIAL",
        useAiGeneration: false,
        useImportedContent: true,
        callToActionOverride: null,
        stepInstructions: null,
        manualSubject: null,
        manualBody: null,
      },
      senderName: "Alex",
      senderCompanyName: "Mail Orbyt",
      aiGenerator: undefined,
      signatureText: "Best,\n{senderName}",
    });

    expect(result).toEqual({
      subject: "Idea for Jamie",
      body: "Hey Jamie,\n\nI noticed the team is expanding.\n\nBest,\nAlex",
    });
    expect(generateEmailMock).not.toHaveBeenCalled();
  });

  it("fails when the lead has no imported email for the step", async () => {
    const prisma = { leadImportedEmail: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(
      materializeStepContent(prisma as never, {
        organisationId: "org-1",
        lead: LEAD,
        step: {
          orderIndex: 1,
          stepType: "FOLLOW_UP",
          useAiGeneration: false,
          useImportedContent: true,
          callToActionOverride: null,
          stepInstructions: null,
          manualSubject: null,
          manualBody: null,
        },
        senderName: "Alex",
        senderCompanyName: "Mail Orbyt",
        aiGenerator: undefined,
      }),
    ).rejects.toBeInstanceOf(MissingImportedEmailError);
  });

  it("applies merge tokens for a manual step without calling AI", async () => {
    const result = await materializeStepContent({} as never, {
      organisationId: "org-1",
      lead: LEAD,
      step: {
        stepType: "INITIAL",
        useAiGeneration: false,
        callToActionOverride: null,
        manualSubject: "Hi {{firstName}}",
        manualBody: "Hi {{firstName}} {{lastName}}, are you the {{title}}?",
      },
      senderName: "Alex",
      senderCompanyName: "Mail Orbyt",
      aiGenerator: undefined,
    });

    expect(result).toEqual({
      subject: "Hi Jamie",
      body: "Hi Jamie Rivera, are you the VP Sales?",
    });
    expect(generateEmailMock).not.toHaveBeenCalled();
  });

  it("falls back to 'there' for a missing firstName merge token", async () => {
    const result = await materializeStepContent({} as never, {
      organisationId: "org-1",
      lead: { id: "lead-2", firstName: null, lastName: null, title: null },
      step: {
        stepType: "INITIAL",
        useAiGeneration: false,
        callToActionOverride: null,
        manualSubject: "Hi {{firstName}}",
        manualBody: "Body",
      },
      senderName: "Alex",
      senderCompanyName: "Mail Orbyt",
      aiGenerator: undefined,
    });
    expect(result.subject).toBe("Hi there");
  });

  it("throws AiNotConfiguredForStepError when the step needs AI but none is configured", async () => {
    await expect(
      materializeStepContent({} as never, {
        organisationId: "org-1",
        lead: LEAD,
        step: {
          stepType: "INITIAL",
          useAiGeneration: true,
          callToActionOverride: null,
          manualSubject: null,
          manualBody: null,
        },
        senderName: "Alex",
        senderCompanyName: "Mail Orbyt",
        aiGenerator: undefined,
      }),
    ).rejects.toBeInstanceOf(AiNotConfiguredForStepError);
  });

  it("generates via AI using the lead's research snapshot facts", async () => {
    createResearchSnapshotMock.mockResolvedValue({
      facts: [
        {
          category: "company_description",
          value: "Builds tools.",
          sourceUrl: "https://acme.example/",
        },
      ],
    });
    getLatestPageTextMock.mockResolvedValue(null);
    generateEmailMock.mockResolvedValue({ subject: "Quick question", body: "Generated body" });

    const fakeGenerator = {} as never;
    const result = await materializeStepContent({} as never, {
      organisationId: "org-1",
      lead: LEAD,
      step: {
        stepType: "INITIAL",
        useAiGeneration: true,
        callToActionOverride: "book a call",
        manualSubject: null,
        manualBody: null,
      },
      senderName: "Alex",
      senderCompanyName: "Mail Orbyt",
      aiGenerator: fakeGenerator,
    });

    expect(result).toEqual({ subject: "Quick question", body: "Generated body" });
    expect(generateEmailMock).toHaveBeenCalledWith(
      fakeGenerator,
      expect.objectContaining({
        generationType: "INITIAL",
        leadFirstName: "Jamie",
        callToAction: "book a call",
        facts: [
          {
            category: "company_description",
            value: "Builds tools.",
            sourceUrl: "https://acme.example/",
          },
        ],
      }),
    );
  });

  it("passes the sending inbox's signatureText through to generateEmail", async () => {
    createResearchSnapshotMock.mockResolvedValue({ facts: [] });
    getLatestPageTextMock.mockResolvedValue(null);
    generateEmailMock.mockResolvedValue({ subject: "Hi", body: "Body" });

    await materializeStepContent({} as never, {
      organisationId: "org-1",
      lead: LEAD,
      step: {
        stepType: "INITIAL",
        useAiGeneration: true,
        callToActionOverride: null,
        manualSubject: null,
        manualBody: null,
      },
      senderName: "Alex",
      senderCompanyName: "Mail Orbyt",
      aiGenerator: {} as never,
      signatureText: "Cheers,\nAlex Rivera\nHead of Sales",
    });

    expect(generateEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signatureText: "Cheers,\nAlex Rivera\nHead of Sales" }),
    );
  });
});
