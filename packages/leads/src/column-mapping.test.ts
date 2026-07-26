import { describe, expect, it } from "vitest";
import { applyColumnMapping, suggestColumnMapping } from "./column-mapping";

describe("suggestColumnMapping", () => {
  it("matches exact canonical header names", () => {
    const mapping = suggestColumnMapping(["first_name", "last_name", "email"]);
    expect(mapping.first_name).toBe("first_name");
    expect(mapping.last_name).toBe("last_name");
    expect(mapping.email).toBe("email");
  });

  it("matches known aliases case-insensitively and ignoring separators", () => {
    const mapping = suggestColumnMapping(["First Name", "Last Name", "Email Address", "Job Title"]);
    expect(mapping.first_name).toBe("First Name");
    expect(mapping.last_name).toBe("Last Name");
    expect(mapping.email).toBe("Email Address");
    expect(mapping.title).toBe("Job Title");
  });

  it("matches company aliases", () => {
    const mapping = suggestColumnMapping(["Organization", "Company Website"]);
    expect(mapping.company).toBe("Organization");
    expect(mapping.website_url).toBe("Company Website");
  });

  it("leaves unmatched canonical columns as null", () => {
    const mapping = suggestColumnMapping(["first_name"]);
    expect(mapping.email).toBeNull();
    expect(mapping.industry).toBeNull();
  });

  it("does not guess when no header is a plausible match", () => {
    const mapping = suggestColumnMapping(["random_col_1", "random_col_2"]);
    for (const value of Object.values(mapping)) {
      expect(value).toBeNull();
    }
  });
});

describe("applyColumnMapping", () => {
  it("maps raw values to canonical fields per the mapping", () => {
    const mapping = suggestColumnMapping(["First Name", "Email Address"]);
    const result = applyColumnMapping(
      { "First Name": "Jane", "Email Address": "jane@example.com" },
      mapping,
    );
    expect(result).toEqual({ first_name: "Jane", email: "jane@example.com" });
  });

  it("omits canonical fields with no mapped source header", () => {
    const mapping = suggestColumnMapping(["First Name"]);
    const result = applyColumnMapping({ "First Name": "Jane" }, mapping);
    expect(result.email).toBeUndefined();
  });
});
