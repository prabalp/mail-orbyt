import { describe, expect, it } from "vitest";
import { resolveInboxSenderName } from "./inbox-identity";

describe("resolveInboxSenderName", () => {
  it("uses displayName when set", () => {
    expect(
      resolveInboxSenderName({ displayName: "Alex Rivera", emailAddress: "alex@acme.example" }),
    ).toBe("Alex Rivera");
  });

  it("derives a name from the email local part when displayName is unset", () => {
    expect(resolveInboxSenderName({ displayName: null, emailAddress: "alex@acme.example" })).toBe(
      "Alex",
    );
  });

  it("splits on dots/underscores/hyphens and capitalizes each part", () => {
    expect(
      resolveInboxSenderName({ displayName: null, emailAddress: "alex.rivera@acme.example" }),
    ).toBe("Alex Rivera");
    expect(
      resolveInboxSenderName({ displayName: null, emailAddress: "alex_rivera@acme.example" }),
    ).toBe("Alex Rivera");
    expect(
      resolveInboxSenderName({ displayName: null, emailAddress: "alex-rivera@acme.example" }),
    ).toBe("Alex Rivera");
  });
});
