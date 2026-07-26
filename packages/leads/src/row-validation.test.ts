import { describe, expect, it } from "vitest";
import { validateMappedRow } from "./row-validation";

describe("validateMappedRow", () => {
  it("accepts a row with a valid email", () => {
    const result = validateMappedRow({ email: "jane@example.com", first_name: "Jane" });
    expect(result.valid).toBe(true);
  });

  it("accepts a row with only a name (no email)", () => {
    const result = validateMappedRow({ first_name: "Jane", last_name: "Doe" });
    expect(result.valid).toBe(true);
  });

  it("rejects a row with an invalid email", () => {
    const result = validateMappedRow({ email: "not-an-email" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(" ")).toMatch(/Invalid email/);
  });

  it("rejects a row with no usable fields at all", () => {
    const result = validateMappedRow({ industry: "SaaS" });
    expect(result.valid).toBe(false);
  });

  it("trims whitespace from fields", () => {
    const result = validateMappedRow({ first_name: "  Jane  ", email: "jane@example.com" });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.row.first_name).toBe("Jane");
  });

  it("treats a blank email as absent rather than invalid", () => {
    const result = validateMappedRow({ email: "   ", first_name: "Jane" });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.row.email).toBeUndefined();
  });
});
