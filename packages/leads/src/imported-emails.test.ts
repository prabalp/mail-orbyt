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

describe("parseImportedEmails journey graph", () => {
  const journey = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      start: "intro",
      emails: {
        intro: {
          subject: "Hi",
          body: "Hello {{firstName}}",
          next: { no_reply: { to: "bump", afterDays: 3 }, interested: "book" },
        },
        bump: { subject: "Bump", body: "Checking in", next: { no_reply: { to: "END" } } },
        book: { subject: "Book", body: "Pick a time" },
      },
      ...overrides,
    });

  it("parses nodes with the start email as sequence 1 and normalises string edges", () => {
    const result = parseImportedEmails("3", journey());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.emails[0]).toMatchObject({ sequence: 1, nodeKey: "intro", isStart: true });
      expect(result.emails[0]?.edges).toEqual({
        no_reply: { to: "bump", afterDays: 3 },
        interested: { to: "book" },
      });
      expect(result.emails.map((email) => email.sequence)).toEqual([1, 2, 3]);
    }
  });

  it("rejects an edge pointing at an unknown node", () => {
    const bad = JSON.stringify({
      start: "intro",
      emails: { intro: { subject: "a", body: "b", next: { no_reply: "ghost" } } },
    });
    const result = parseImportedEmails("1", bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('unknown node "ghost"');
  });

  it("rejects a missing start and unreachable emails", () => {
    expect(parseImportedEmails("3", journey({ start: "nope" })).ok).toBe(false);
    const orphan = JSON.stringify({
      start: "intro",
      emails: {
        intro: { subject: "a", body: "b" },
        lonely: { subject: "c", body: "d" },
      },
    });
    const result = parseImportedEmails("2", orphan);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("lonely");
  });

  it("rejects a total_mails that does not match the node count", () => {
    expect(parseImportedEmails("2", journey()).ok).toBe(false);
  });

  it("allows a cycle back to an earlier node", () => {
    const cyc = JSON.stringify({
      start: "a",
      emails: {
        a: { subject: "a", body: "a", next: { no_reply: "b" } },
        b: { subject: "b", body: "b", next: { no_reply: "a" } },
      },
    });
    expect(parseImportedEmails("2", cyc).ok).toBe(true);
  });
});
