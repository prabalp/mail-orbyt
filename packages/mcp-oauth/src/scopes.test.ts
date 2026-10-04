import { describe, expect, it } from "vitest";
import { intersectScopes, parseScope, scopeIncludes, scopesGrantedByRole } from "./scopes";

describe("scopesGrantedByRole", () => {
  it("grants every permission scope to OWNER", () => {
    const scopes = scopesGrantedByRole("OWNER");
    expect(scopes).toContain("leads:manage");
    expect(scopes).toContain("organisation:delete");
    expect(scopes).toContain("profile");
  });

  it("grants VIEWER only profile and leads:read", () => {
    expect(scopesGrantedByRole("VIEWER")).toEqual(["profile", "leads:read"]);
  });

  it("grants leads:read alongside leads:manage to MEMBER", () => {
    const scopes = scopesGrantedByRole("MEMBER");
    expect(scopes).toContain("leads:read");
    expect(scopes).toContain("leads:manage");
  });
});

describe("intersectScopes", () => {
  it("drops requested scopes the role does not hold", () => {
    const result = intersectScopes("profile leads:manage organisation:delete", "MEMBER");
    expect(parseScope(result)).toEqual(["profile", "leads:manage"]);
  });

  it("returns an empty string when nothing overlaps", () => {
    expect(intersectScopes("organisation:delete", "VIEWER")).toBe("");
  });
});

describe("scopeIncludes", () => {
  it("checks membership within a space-separated scope string", () => {
    expect(scopeIncludes("profile leads:manage", "leads:manage")).toBe(true);
    expect(scopeIncludes("profile leads:manage", "campaigns:manage")).toBe(false);
  });

  it("treats leads:manage as implying leads:read, but not the reverse", () => {
    expect(scopeIncludes("profile leads:manage", "leads:read")).toBe(true);
    expect(scopeIncludes("profile leads:read", "leads:manage")).toBe(false);
  });
});
