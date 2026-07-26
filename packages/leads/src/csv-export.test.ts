import { describe, expect, it } from "vitest";
import { buildSanitizedCsv, sanitizeCsvField } from "./csv-export";

describe("sanitizeCsvField", () => {
  it("prefixes formula-triggering leading characters with a single quote", () => {
    expect(sanitizeCsvField("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(sanitizeCsvField("+1234")).toBe("'+1234");
    expect(sanitizeCsvField("-1234")).toBe("'-1234");
    expect(sanitizeCsvField("@SUM(1+1)")).toBe("'@SUM(1+1)");
  });

  it("leaves safe values unchanged", () => {
    expect(sanitizeCsvField("Acme Inc")).toBe("Acme Inc");
    expect(sanitizeCsvField("jane@example.com")).toBe("jane@example.com");
  });

  it("handles an empty string without indexing errors", () => {
    expect(sanitizeCsvField("")).toBe("");
  });
});

describe("buildSanitizedCsv", () => {
  it("produces a CSV with header and sanitized rows", () => {
    const csv = buildSanitizedCsv(
      ["name", "notes"],
      [{ name: "Acme Inc", notes: '=HYPERLINK("evil.com")' }],
    );
    expect(csv).toContain("name,notes");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/^=/m);
  });

  it("fills missing columns with empty strings", () => {
    const csv = buildSanitizedCsv(["name", "email"], [{ name: "Jane" }]);
    expect(csv.trim().split("\n")[1]).toBe("Jane,");
  });
});
