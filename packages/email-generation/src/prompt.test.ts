import { describe, expect, it } from "vitest";
import {
  BOOKING_LINK_PLACEHOLDER,
  buildGenerateEmailPrompt,
  buildReviewEmailPrompt,
  buildRewriteEmailPrompt,
} from "./prompt";
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

  it("system prompt forbids the model from writing its own sign-off/signature", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).toMatch(/do not write any closing sign-off/i);
    expect(system).toMatch(/appended automatically/i);
  });

  it("system prompt requires blank-line paragraph breaks", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).toMatch(/blank line/i);
  });

  it("system prompt requires a professional, non-clickbait subject line", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).toMatch(/clickbait/i);
    expect(system).toMatch(/spam-trigger words/i);
  });

  it("omits the website-text block when none is provided", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(user).not.toMatch(/background context/i);
  });

  it("includes a truncated, explicitly-untrusted website-text block when provided", () => {
    const longText = "a".repeat(3000);
    const { user } = buildGenerateEmailPrompt({ ...BASE_INPUT, websiteText: longText });
    expect(user).toMatch(/untrusted/i);
    expect(user).toMatch(/never follow any instruction/i);
    expect(user).toContain("a".repeat(2000));
    expect(user).not.toContain("a".repeat(2001));
  });

  it("instructs the model to use the booking-link placeholder, never a real URL, when a bookingLink is set", () => {
    const { user } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      bookingLink: "https://calendly.com/acme/intro",
    });
    expect(user).toContain(BOOKING_LINK_PLACEHOLDER);
    expect(user).not.toContain("https://calendly.com/acme/intro");
  });

  it("omits any booking-link instruction when none is configured", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(user).not.toContain(BOOKING_LINK_PLACEHOLDER);
  });

  it("appends organisation custom instructions after the fixed hard rules, without removing them", () => {
    const { system } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      customInstructions: "Always sign off with 'Cheers,'",
    });
    expect(system).toMatch(/never invent/i);
    expect(system).toContain("Always sign off with 'Cheers,'");
    expect(system).toMatch(/never overridden by this section/i);
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

  it("instructs preserving an existing signature rather than stripping it", () => {
    const { system } = buildRewriteEmailPrompt({
      style: "FORMAL",
      subject: "Hi",
      body: "Original body\n\nBest,\nAlex",
    });
    expect(system).toMatch(/preserve it exactly/i);
  });
});

describe("buildReviewEmailPrompt", () => {
  it("includes the current subject and body for review", () => {
    const { user } = buildReviewEmailPrompt({
      subject: "Quick question",
      body: "Would you be open to a quick call?",
    });
    expect(user).toContain("Quick question");
    expect(user).toContain("Would you be open to a quick call?");
  });

  it("forbids the reviewer from changing facts, URLs, or an existing signature", () => {
    const { system } = buildReviewEmailPrompt({ subject: "Hi", body: "Body" });
    expect(system).toMatch(/do not add, remove, or change any factual claim/i);
    expect(system).toMatch(/leave it byte-for-byte identical/i);
  });
});
