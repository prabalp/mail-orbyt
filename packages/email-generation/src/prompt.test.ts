import { describe, expect, it } from "vitest";
import {
  BOOKING_LINK_PLACEHOLDER,
  buildGenerateEmailPrompt,
  buildReviewEmailPrompt,
  DEFAULT_CAMPAIGN_EMAIL_PROMPT,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_REVIEW_SYSTEM_PROMPT,
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
    expect(system).toMatch(/never write a closing sign-off/i);
    expect(system).toMatch(/appended automatically/i);
  });

  // The split that makes the flow concise: safety in the system prompt, shape
  // in the campaign prompt. A format rule leaking back into the system prompt
  // would silently override whatever a campaign asked for.
  it("keeps formatting rules out of the system prompt", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).not.toMatch(/blank line/i);
    expect(system).not.toMatch(/30-55/);
    expect(system).not.toMatch(/clickbait/i);
    expect(system).not.toMatch(/hi \{first name\}/i);
  });

  it("puts greeting, paragraph, and subject-line rules in the campaign prompt", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(user).toMatch(/hi \{first name\}/i);
    expect(user).toMatch(/blank line/i);
    expect(user).toMatch(/30-55/);
  });

  it("omits the website-text block when none is provided", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    // Anchored on the block's own header — the campaign prompt mentions
    // background context as usable data whether or not any is attached.
    expect(user).not.toMatch(/Background context —/);
  });

  // The excerpt is usable material, but it is data and never direction — the
  // injection defense is the one thing that must survive any loosening here.
  it("includes a truncated website-text block carrying the injection defense when provided", () => {
    const longText = "a".repeat(3000);
    const { user } = buildGenerateEmailPrompt({ ...BASE_INPUT, websiteText: longText });
    expect(user).toMatch(/never as direction/i);
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

  it("puts the campaign prompt in the user message, never the system prompt", () => {
    const { system, user } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      campaignPrompt: "Use first name only. Two sentences.",
    });
    expect(user).toContain("Use first name only. Two sentences.");
    expect(system).not.toContain("Use first name only. Two sentences.");
    // The safety rules survive alongside it, un-negotiated.
    expect(system).toMatch(/never invent/i);
  });

  it("falls back to the default campaign prompt when the campaign sets none", () => {
    const { user } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(user).toContain(DEFAULT_CAMPAIGN_EMAIL_PROMPT);
  });

  it("treats a whitespace-only campaign prompt as unset", () => {
    const { user } = buildGenerateEmailPrompt({ ...BASE_INPUT, campaignPrompt: "   \n  " });
    expect(user).toContain(DEFAULT_CAMPAIGN_EMAIL_PROMPT);
  });

  it("keeps the campaign prompt and the lead data in separate sections", () => {
    const { user } = buildGenerateEmailPrompt({ ...BASE_INPUT, campaignPrompt: "Be terse." });
    expect(user.indexOf("Be terse.")).toBeLessThan(user.indexOf("Recipient:"));
  });

  it("uses the default generation system prompt when no override is given", () => {
    const { system } = buildGenerateEmailPrompt(BASE_INPUT);
    expect(system).toBe(DEFAULT_GENERATION_SYSTEM_PROMPT);
  });

  it("uses a custom generationSystemPromptOverride instead of the default", () => {
    const { system, user } = buildGenerateEmailPrompt({
      ...BASE_INPUT,
      generationSystemPromptOverride: "Custom base rules only.",
      campaignPrompt: "Extra tone guidance.",
    });
    expect(system).toBe("Custom base rules only.");
    expect(user).toContain("Extra tone guidance.");
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

  it("never invents a recipient name while correcting", () => {
    const { system } = buildReviewEmailPrompt({ subject: "Hi", body: "Body" });
    expect(system).toMatch(/do not invent a recipient name/i);
  });

  // QA checks the draft against the CAMPAIGN's format, not a house style —
  // otherwise a campaign asking for one-line emails gets "corrected" back.
  it("hands the campaign prompt to the reviewer as the spec to check against", () => {
    const { system, user } = buildReviewEmailPrompt(
      { subject: "Hi", body: "Body" },
      { campaignPrompt: "One line only, no greeting." },
    );
    expect(user).toContain("One line only, no greeting.");
    expect(system).toMatch(/campaign's formatting instructions/i);
  });

  it("carries no format rules of its own in the default review prompt", () => {
    const { system } = buildReviewEmailPrompt({ subject: "Hi", body: "Body" });
    expect(system).not.toMatch(/2-4 short paragraphs/i);
    expect(system).not.toMatch(/30-55/);
  });

  it("uses the default review system prompt when no override is given", () => {
    const { system } = buildReviewEmailPrompt({ subject: "Hi", body: "Body" });
    expect(system).toBe(DEFAULT_REVIEW_SYSTEM_PROMPT);
  });

  it("uses a custom reviewSystemPromptOverride instead of the default when given", () => {
    const { system } = buildReviewEmailPrompt(
      { subject: "Hi", body: "Body" },
      { reviewSystemPromptOverride: "Custom review rules." },
    );
    expect(system).toBe("Custom review rules.");
  });
});
