import { describe, expect, it } from "vitest";
import { canAssignRole, hasPermission } from "./permissions";

describe("hasPermission", () => {
  it("grants OWNER full access including billing and deletion", () => {
    expect(hasPermission("OWNER", "billing:manage")).toBe(true);
    expect(hasPermission("OWNER", "organisation:delete")).toBe(true);
  });

  it("grants ADMIN member/campaign/inbox management but not billing or deletion", () => {
    expect(hasPermission("ADMIN", "members:manage")).toBe(true);
    expect(hasPermission("ADMIN", "campaigns:manage")).toBe(true);
    expect(hasPermission("ADMIN", "billing:manage")).toBe(false);
    expect(hasPermission("ADMIN", "organisation:delete")).toBe(false);
  });

  it("grants MEMBER lead/campaign/research/conversation access but not member management", () => {
    expect(hasPermission("MEMBER", "leads:manage")).toBe(true);
    expect(hasPermission("MEMBER", "campaigns:manage")).toBe(true);
    expect(hasPermission("MEMBER", "members:manage")).toBe(false);
    expect(hasPermission("MEMBER", "inboxes:manage")).toBe(false);
  });

  it("grants VIEWER no mutating permissions", () => {
    expect(hasPermission("VIEWER", "leads:manage")).toBe(false);
    expect(hasPermission("VIEWER", "campaigns:manage")).toBe(false);
    expect(hasPermission("VIEWER", "analytics:view")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("only allows OWNER to grant the OWNER role", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
  });

  it("allows ADMIN to assign non-OWNER roles", () => {
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "MEMBER")).toBe(true);
    expect(canAssignRole("ADMIN", "VIEWER")).toBe(true);
  });

  it("does not allow MEMBER or VIEWER to assign any role", () => {
    expect(canAssignRole("MEMBER", "VIEWER")).toBe(false);
    expect(canAssignRole("VIEWER", "VIEWER")).toBe(false);
  });
});
