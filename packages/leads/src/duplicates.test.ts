import { describe, expect, it } from "vitest";
import {
  decideDuplicateAction,
  findWithinBatchDuplicates,
  mapRowToLeadFields,
  mergeOverwrite,
  mergeUpdateBlanksOnly,
} from "./duplicates";

describe("decideDuplicateAction", () => {
  it("always creates when no existing lead is found, regardless of strategy", () => {
    expect(decideDuplicateAction("SKIP", false)).toBe("CREATE");
    expect(decideDuplicateAction("REJECT", false)).toBe("CREATE");
  });

  it("maps each strategy to its corresponding action when a duplicate exists", () => {
    expect(decideDuplicateAction("SKIP", true)).toBe("SKIP");
    expect(decideDuplicateAction("UPDATE_BLANKS", true)).toBe("UPDATE_BLANKS");
    expect(decideDuplicateAction("OVERWRITE", true)).toBe("OVERWRITE");
    expect(decideDuplicateAction("REJECT", true)).toBe("REJECT");
    expect(decideDuplicateAction("ALLOW_SEPARATE", true)).toBe("CREATE_SEPARATE");
  });
});

describe("mapRowToLeadFields", () => {
  it("translates snake_case canonical fields to the Lead model's camelCase fields", () => {
    expect(mapRowToLeadFields({ first_name: "Jane", website_url: "https://example.com" })).toEqual(
      expect.objectContaining({ firstName: "Jane", websiteUrl: "https://example.com" }),
    );
  });

  it("does not include a company field — that's resolved separately", () => {
    const result = mapRowToLeadFields({ company: "Acme Inc" }) as Record<string, unknown>;
    expect(result.company).toBeUndefined();
  });
});

describe("mergeUpdateBlanksOnly", () => {
  it("fills empty fields but never overwrites existing non-empty values", () => {
    const existing = { firstName: "Jane", lastName: null, title: "" };
    const merged = mergeUpdateBlanksOnly(existing, {
      firstName: "Janet",
      lastName: "Doe",
      title: "VP",
    });
    expect(merged.firstName).toBe("Jane");
    expect(merged.lastName).toBe("Doe");
    expect(merged.title).toBe("VP");
  });

  it("ignores incoming fields that are undefined", () => {
    const existing = { firstName: "Jane" };
    const merged = mergeUpdateBlanksOnly(existing, {});
    expect(merged.firstName).toBe("Jane");
  });
});

describe("mergeOverwrite", () => {
  it("lets incoming values replace existing ones", () => {
    const existing = { firstName: "Jane", lastName: "Doe" };
    const merged = mergeOverwrite(existing, { firstName: "Janet" });
    expect(merged.firstName).toBe("Janet");
    expect(merged.lastName).toBe("Doe");
  });
});

describe("findWithinBatchDuplicates", () => {
  it("flags the second and later occurrences of the same email", () => {
    const duplicates = findWithinBatchDuplicates([
      { rowNumber: 1, email: "jane@example.com" },
      { rowNumber: 2, email: "john@example.com" },
      { rowNumber: 3, email: "jane@example.com" },
      { rowNumber: 4, email: "jane@example.com" },
    ]);
    expect(duplicates).toEqual(new Set([3, 4]));
  });

  it("never flags rows with no email", () => {
    const duplicates = findWithinBatchDuplicates([
      { rowNumber: 1, email: undefined },
      { rowNumber: 2, email: undefined },
    ]);
    expect(duplicates.size).toBe(0);
  });
});
