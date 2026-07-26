import { describe, expect, it } from "vitest";
import {
  extractDomain,
  extractDomainFromEmail,
  normalizeCountry,
  normalizeEmail,
  normalizeJobTitle,
  normalizeName,
  normalizeState,
  normalizeUrl,
  normalizeWhitespace,
} from "./normalize";

describe("normalizeWhitespace", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeWhitespace("  Jane   Doe  ")).toBe("Jane Doe");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });
});

describe("normalizeName", () => {
  it("title-cases each word", () => {
    expect(normalizeName("jane DOE")).toBe("Jane Doe");
  });

  it("title-cases hyphenated names correctly", () => {
    expect(normalizeName("mary-jane o'brien")).toBe("Mary-Jane O'brien");
  });

  it("collapses internal whitespace before casing", () => {
    expect(normalizeName("  jane   doe ")).toBe("Jane Doe");
  });
});

describe("normalizeJobTitle", () => {
  it("collapses whitespace but preserves case", () => {
    expect(normalizeJobTitle("  VP  of   Sales ")).toBe("VP of Sales");
  });
});

describe("normalizeUrl", () => {
  it("adds https scheme when missing", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("lowercases the host but not the path", () => {
    expect(normalizeUrl("https://EXAMPLE.com/Path")).toBe("https://example.com/Path");
  });

  it("strips a trailing slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("passes through unparseable input unchanged", () => {
    expect(normalizeUrl("not a url::")).toBe("not a url::");
  });
});

describe("extractDomain", () => {
  it("extracts a lowercase hostname without www", () => {
    expect(extractDomain("https://www.Example.com/page")).toBe("example.com");
  });

  it("returns null for unparseable input", () => {
    expect(extractDomain("not a url::")).toBeNull();
  });
});

describe("extractDomainFromEmail", () => {
  it("extracts the domain after the last @", () => {
    expect(extractDomainFromEmail("jane@mail.example.com")).toBe("mail.example.com");
  });

  it("returns null when there is no @", () => {
    expect(extractDomainFromEmail("not-an-email")).toBeNull();
  });
});

describe("normalizeCountry", () => {
  it("maps common aliases to a canonical form", () => {
    expect(normalizeCountry("USA")).toBe("United States");
    expect(normalizeCountry("uk")).toBe("United Kingdom");
  });

  it("passes through unknown countries with whitespace normalized", () => {
    expect(normalizeCountry("  Germany ")).toBe("Germany");
  });
});

describe("normalizeState", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeState("  New   York ")).toBe("New York");
  });
});
