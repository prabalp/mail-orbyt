import { describe, expect, it } from "vitest";
import { buildGenerateEmailPrompt, buildRewriteEmailPrompt } from "./prompt";
import type { GenerateEmailInput } from "./types";

const BASE_INPUT: GenerateEmailInput = {
  generationType: "INITIAL",
  leadFirstName: "Jamie",
  leadTitle: "VP Sales",
  companyName: "Acme Inc",
  senderName: "Alex",
  senderCompanyName: "Mail Orbyt",
  callToAction: "book a 15 minute intro call",
  facts: [
    {
      category: "company_description",
      value: "Builds developer tools.",
      sourceUrl: "https://acme.example/",
    },
  ],
};

describe("buildGenerateEmailPrompt", () => {
  it("includes every provided fact in the user prompt", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(user).toContain("Builds developer tools.");
    expect(user).toContain("company_description");
  });

  it("states there are no facts when none are provided", () => {
    const { user } = buildGenerateEmailPrompt({ ...BASE_INPUT, facts: [] });
    expect(user).toContain("No researched facts are available");
  });

  it("includes the prior email for a FOLLOW_UP", () => {
    const { user } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      generationType: "FOLLOW_UP",
      priorEmail: { subject: "Quick question", body: "Original body text" },
    });
    expect(user).toContain("FOLLOW-UP");
    expect(user).toContain("Original body text");
  });

  it("includes close-the-loop framing for CLOSE_THE_LOOP", () => {
    const { user } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      generationType: "CLOSE_THE_LOOP",
      priorEmail: { subject: "Quick question", body: "Original body text" },
    });
    expect(user).toContain("CLOSE-THE-LOOP");
  });

  it("system prompt forbids inventing facts and disclosing methodology", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/never mention or allude to research/i);
  });
});

describe("buildRewriteEmailPrompt", () => {
  it("includes style-specific instructions and forbids new facts", () => {
    const { system, user } = buildRewriteEmailPrompt({
      style: "SHORTER",
      subject: "Hi",
      body: "Original long body",
    });
    expect(user).toMatch(/shorter/i);
    expect(user).toContain("Original long body");
    expect(system).toMatch(/do not add any new factual claim/i);
  });
});
