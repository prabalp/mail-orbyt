import { describe, expect, it, vi } from "vitest";
import { generateEmail, rewriteEmail } from "./generate";
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

  it("does not double up a signature the model already included", async () => {
    const generator = fakeGenerator({
      subject: "Hi",
      body: "Would you be open to a quick call?\n\nBest,\nAlex",
    });
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
    expect(generator.complete).toHaveBeenCalledTimes(2);
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
      body: `Want to chat? Grab a time here: ${BOOKING_LINK_PLACEHOLDER}\n\nBest,\nAlex`,
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

describe("rewriteEmail", () => {
  it("returns the rewritten email when valid", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Shorter version." });
    const result = await rewriteEmail(generator, {
      style: "SHORTER",
      subject: "Hi",
      body: "Original longer body text here.",
    });
    expect(result.body).toBe("Shorter version.");
  });

  it("allows the rewrite to keep a URL that was already present in the original email", async () => {
    const originalBody = "Book here: https://calendly.com/acme/intro. Talk soon.";
    const generator = fakeGenerator({
      subject: "Hi",
      body: "Shorter — book here: https://calendly.com/acme/intro",
    });
    const result = await rewriteEmail(generator, {
      style: "SHORTER",
      subject: "Hi",
      body: originalBody,
    });
    expect(result.body).toBe("Shorter — book here: https://calendly.com/acme/intro");
  });

  it("still rejects a URL introduced by the rewrite that wasn't in the original", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Shorter — book here: https://not-in-original.example/booking" },
      { subject: "Hi", body: "Shorter — book here: https://not-in-original.example/booking" },
    );
    await expect(
      rewriteEmail(generator, {
        style: "SHORTER",
        subject: "Hi",
        body: "Original body with no links at all.",
      }),
    ).rejects.toBeInstanceOf(GeneratedEmailValidationError);
  });
});
