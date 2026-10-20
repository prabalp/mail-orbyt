import { describe, expect, it } from "vitest";
import { parseImportedEmails } from "./imported-emails";
import { validateMappedRow } from "./row-validation";

const EMAILS = JSON.stringify([
  {
    sequence: 1,
    type: "INITIAL",
    subject: "Idea for Acme",
    body: "I noticed Acme is expanding.",
  },
  {
    sequence: 2,
    type: "FOLLOW_UP",
    subject: "Following up",
    body: "Wanted to check whether this is a priority.",
  },
]);

describe("parseImportedEmails", () => {
  it("accepts a matching total_mails and emails array", () => {
    const result = parseImportedEmails("2", EMAILS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.emails.map((email) => email.emailType)).toEqual(["INITIAL", "FOLLOW_UP"]);
    }
  });

  it("rejects a count that does not match the array", () => {
    const result = parseImportedEmails("3", EMAILS);
    expect(result.ok).toBe(false);
  });

  it("rejects sequences that skip or repeat", () => {
    const result = parseImportedEmails(
      "2",
      JSON.stringify([
        { sequence: 1, type: "INITIAL", subject: "A", body: "One" },
        { sequence: 1, type: "FOLLOW_UP", subject: "B", body: "Two" },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("requires both columns together", () => {
    expect(parseImportedEmails("1", undefined).ok).toBe(false);
    expect(parseImportedEmails(undefined, EMAILS).ok).toBe(false);
  });
});

describe("validateMappedRow imported emails", () => {
  it("keeps a lead row valid when no emails are supplied", () => {
    const result = validateMappedRow({ email: "jamie@example.com" });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.importedEmails).toEqual([]);
  });

  it("returns the parsed emails on a valid row", () => {
    const result = validateMappedRow({
      email: "jamie@example.com",
      total_mails: "2",
      emails: EMAILS,
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.importedEmails).toHaveLength(2);
  });
});
