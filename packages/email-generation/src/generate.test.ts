import { describe, expect, it, vi } from "vitest";
import { generateEmail } from "./generate";
import { BOOKING_LINK_PLACEHOLDER } from "./prompt";
import { GeneratedEmailValidationError } from "./validator";
import type { AiEmailGenerator } from "./client";
import type { GenerateEmailInput } from "./types";

function fakeGenerator(...responses: { subject: string; body: string }[]): AiEmailGenerator {
  const complete = vi.fn();
  for (const response of responses) complete.mockResolvedValueOnce(response);
  return { complete };
}

const BASE_INPUT: GenerateEmailInput = {
  generationType: "INITIAL",
  senderName: "Alex",
  senderCompanyName: "Mail Orbyt",
  callToAction: "book a 15 minute intro call",
  facts: [],
};

describe("generateEmail", () => {
  it("returns the model's output, with a signature appended, when it passes validation", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Would you be open to a quick call?" });
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result).toEqual({
      subject: "Hi",
      body: "Would you be open to a quick call?\n\nBest,\nAlex",
    });
  });

  it("uses a custom signatureText instead of the default fallback when provided", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Would you be open to a quick call?" });
    const result = await generateEmail(generator, {
      ...BASE_INPUT,
      signatureText: "Cheers,\nAlex Rivera\nHead of Sales, Mail Orbyt",
    });
    expect(result.body).toBe(
      "Would you be open to a quick call?\n\nCheers,\nAlex Rivera\nHead of Sales, Mail Orbyt",
    );
  });

  // Both calls in the two-prompt flow must see the campaign's instructions:
  // generation to write to them, QA to check against them.
  it("passes the campaign prompt to both the generation and the QA pass", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Would you be open to a quick call?" },
      { subject: "Hi", body: "Would you be open to a quick call?" },
    );
    await generateEmail(generator, { ...BASE_INPUT, campaignPrompt: "One line only." });

    const [generationCall, reviewCall] = vi.mocked(generator.complete).mock.calls;
    expect(generationCall?.[0].user).toContain("One line only.");
    expect(reviewCall?.[0].user).toContain("One line only.");
  });

  it("applies the review pass's corrected output when the review differs and still validates", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Would you be open to a quick call" },
      { subject: "Quick intro call?", body: "Would you be open to a quick call?" },
    );
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result.subject).toBe("Quick intro call?");
    expect(result.body).toBe("Would you be open to a quick call?\n\nBest,\nAlex");
  });

  it("discards the review pass's output and keeps the original if the review fails validation", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Would you be open to a quick call?" },
      { subject: "Hi", body: "Reply to me at fake@invented.example" },
    );
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result.body).toBe("Would you be open to a quick call?\n\nBest,\nAlex");
  });

  it("retries once on a validation failure and returns the second attempt if it passes", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Reply to me at fake@invented.example" },
      { subject: "Hi", body: "Would you be open to a quick call?" },
    );
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result.body).toBe("Would you be open to a quick call?\n\nBest,\nAlex");
    // 2 generation attempts + 1 review pass call.
    expect(generator.complete).toHaveBeenCalledTimes(3);
  });

  it("throws GeneratedEmailValidationError if every attempt fails validation", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Reply to me at fake@invented.example" },
      { subject: "Hi", body: "Reply to me at fake@invented.example" },
    );
    await expect(generateEmail(generator, BASE_INPUT)).rejects.toBeInstanceOf(
      GeneratedEmailValidationError,
    );
  });

  it("requires a priorEmail for FOLLOW_UP", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Body" });
    await expect(
      generateEmail(generator, { ...BASE_INPUT, generationType: "FOLLOW_UP" }),
    ).rejects.toThrow(/requires a priorEmail/);
  });

  it("requires a priorEmail for CLOSE_THE_LOOP", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Body" });
    await expect(
      generateEmail(generator, { ...BASE_INPUT, generationType: "CLOSE_THE_LOOP" }),
    ).rejects.toThrow(/requires a priorEmail/);
  });

  it("substitutes the booking-link placeholder with the real URL when the model includes it", async () => {
    const generator = fakeGenerator({
      subject: "Hi",
      body: `Want to chat? Grab a time here: ${BOOKING_LINK_PLACEHOLDER}`,
    });
    const result = await generateEmail(generator, {
      ...BASE_INPUT,
      bookingLink: "https://calendly.com/acme/intro",
    });
    expect(result.body).toBe(
      "Want to chat? Grab a time here: https://calendly.com/acme/intro\n\nBest,\nAlex",
    );
    expect(result.body).not.toContain(BOOKING_LINK_PLACEHOLDER);
  });

  it("appends a deterministic booking-link line when the model drops the placeholder", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Would you be open to a quick call?" });
    const result = await generateEmail(generator, {
      ...BASE_INPUT,
      bookingLink: "https://calendly.com/acme/intro",
    });
    expect(result.body).toBe(
      "Would you be open to a quick call?\n\nBook a time here: https://calendly.com/acme/intro\n\nBest,\nAlex",
    );
  });

  it("leaves output untouched (besides the signature) when no bookingLink is configured", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Would you be open to a quick call?" });
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result.body).toBe("Would you be open to a quick call?\n\nBest,\nAlex");
    expect(result.body).not.toContain("Book a time here");
  });
});
