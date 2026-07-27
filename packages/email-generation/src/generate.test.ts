import { describe, expect, it, vi } from "vitest";
import { generateEmail, rewriteEmail } from "./generate";
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
  it("returns the model's output when it passes validation", async () => {
    const generator = fakeGenerator({ subject: "Hi", body: "Would you be open to a quick call?" });
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result).toEqual({ subject: "Hi", body: "Would you be open to a quick call?" });
  });

  it("retries once on a validation failure and returns the second attempt if it passes", async () => {
    const generator = fakeGenerator(
      { subject: "Hi", body: "Reply to me at fake@invented.example" },
      { subject: "Hi", body: "Would you be open to a quick call?" },
    );
    const result = await generateEmail(generator, BASE_INPUT);
    expect(result.body).toBe("Would you be open to a quick call?");
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
});
