import { describe, expect, it } from "vitest";
import { emailSchema, paginationSchema, timezoneSchema, urlSchema } from "./primitives";

describe("emailSchema", () => {
  it("lowercases and trims", () => {
    expect(emailSchema.parse("  Jane.Doe@Example.com  ")).toBe("jane.doe@example.com");
  });

  it("rejects invalid emails", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
});

describe("urlSchema", () => {
  it("accepts valid https urls", () => {
    expect(urlSchema.parse("https://example.com/path")).toBe("https://example.com/path");
  });

  it("rejects non-url strings", () => {
    expect(() => urlSchema.parse("example.com")).toThrow();
  });
});

describe("paginationSchema", () => {
  it("applies defaults", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("caps pageSize at 100", () => {
    expect(() => paginationSchema.parse({ pageSize: 500 })).toThrow();
  });

  it("coerces string query params", () => {
    expect(paginationSchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });
});

describe("timezoneSchema", () => {
  it("accepts a valid IANA timezone", () => {
    expect(timezoneSchema.parse("America/New_York")).toBe("America/New_York");
  });

  it("rejects an invalid timezone", () => {
    expect(() => timezoneSchema.parse("Not/AZone")).toThrow();
  });
});
