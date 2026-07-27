import { describe, expect, it, vi } from "vitest";

const generateEmailMock = vi.fn();
vi.mock("@mail-orbyt/email-generation", () => ({ generateEmail: generateEmailMock }));

const createResearchSnapshotMock = vi.fn();
vi.mock("@mail-orbyt/research", () => ({ createResearchSnapshot: createResearchSnapshotMock }));

const { materializeStepContent, AiNotConfiguredForStepError } = await import("./content");

const LEAD = { id: "lead-1", firstName: "Jamie", lastName: "Rivera", title: "VP Sales" };

describe("materializeStepContent", () => {
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
});
