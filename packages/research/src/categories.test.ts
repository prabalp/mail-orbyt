import { describe, expect, it } from "vitest";
import {
  assertAllowedCategory,
  isProhibitedCategory,
  ProhibitedCategoryError,
  UnknownCategoryError,
} from "./categories";

describe("isProhibitedCategory", () => {
  it("flags every prohibited category", () => {
    expect(isProhibitedCategory("health")).toBe(true);
    expect(isProhibitedCategory("religion")).toBe(true);
    expect(isProhibitedCategory("political_affiliation")).toBe(true);
    expect(isProhibitedCategory("sexual_orientation")).toBe(true);
    expect(isProhibitedCategory("family_information")).toBe(true);
    expect(isProhibitedCategory("private_addresses")).toBe(true);
    expect(isProhibitedCategory("private_phone_numbers")).toBe(true);
    expect(isProhibitedCategory("personal_financial_information")).toBe(true);
    expect(isProhibitedCategory("psychological_inference")).toBe(true);
    expect(isProhibitedCategory("private_social_media_content")).toBe(true);
  });

  it("does not flag legitimate categories", () => {
    expect(isProhibitedCategory("awards")).toBe(false);
    expect(isProhibitedCategory("company_description")).toBe(false);
  });
});

describe("assertAllowedCategory", () => {
  it("allows a valid person category for LEAD", () => {
    expect(() => assertAllowedCategory("awards", "LEAD")).not.toThrow();
  });

  it("allows a valid company category for COMPANY", () => {
    expect(() => assertAllowedCategory("funding", "COMPANY")).not.toThrow();
  });

  it("rejects a prohibited category even if it were otherwise plausible", () => {
    expect(() => assertAllowedCategory("health", "LEAD")).toThrow(ProhibitedCategoryError);
  });

  it("rejects a company category applied to a LEAD subject", () => {
    expect(() => assertAllowedCategory("funding", "LEAD")).toThrow(UnknownCategoryError);
  });

  it("rejects a person category applied to a COMPANY subject", () => {
    expect(() => assertAllowedCategory("awards", "COMPANY")).not.toThrow(); // "awards" is valid for both
    expect(() => assertAllowedCategory("public_quotes", "COMPANY")).toThrow(UnknownCategoryError);
  });

  it("rejects a completely unknown category", () => {
    expect(() => assertAllowedCategory("made_up_category", "LEAD")).toThrow(UnknownCategoryError);
  });
});
