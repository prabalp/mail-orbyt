import { describe, expect, it } from "vitest";
import { validateGeneratedEmail } from "./validator";

const FACTS = [
  {
    category: "company_description",
    value: "Builds developer tools.",
    sourceUrl: "https://acme.example/about",
  },
];

describe("validateGeneratedEmail", () => {
  it("passes a clean, plain-text email", () => {
    const violations = validateGeneratedEmail(
      {
        subject: "Quick question",
        body: "Hi there, would you be open to a 15 minute call next week?",
      },
      FACTS,
    );
    expect(violations).toEqual([]);
  });

  it("flags HTML markup", () => {
    const violations = validateGeneratedEmail({ subject: "Hi", body: "<b>Hello</b> there" }, FACTS);
    expect(violations.some((v) => v.includes("HTML"))).toBe(true);
  });

  it("flags a URL not present in the provided facts", () => {
    const violations = validateGeneratedEmail(
      { subject: "Hi", body: "Check out https://invented-domain.example/promo for more." },
      FACTS,
    );
    expect(violations.some((v) => v.includes("references a URL"))).toBe(true);
  });

  it("allows a URL whose hostname matches a provided fact's source", () => {
    const violations = validateGeneratedEmail(
      { subject: "Hi", body: "See https://acme.example/about for details." },
      FACTS,
    );
    expect(violations).toEqual([]);
  });

  it("flags an invented email address", () => {
    const violations = validateGeneratedEmail(
      { subject: "Hi", body: "Reply to me at fake@invented.example anytime." },
      FACTS,
    );
    expect(violations.some((v) => v.includes("email address"))).toBe(true);
  });

  it("flags research/AI-methodology disclosure", () => {
    const violations = validateGeneratedEmail(
      { subject: "Hi", body: "Based on my research, your team is growing fast." },
      FACTS,
    );
    expect(violations.some((v) => v.includes("discloses AI/research methodology"))).toBe(true);
  });

  it("flags an overly long body", () => {
    const longBody = Array.from({ length: 300 }, () => "word").join(" ");
    const violations = validateGeneratedEmail({ subject: "Hi", body: longBody }, FACTS);
    expect(violations.some((v) => v.includes("too long"))).toBe(true);
  });
});
