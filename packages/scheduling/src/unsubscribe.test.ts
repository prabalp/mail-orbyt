import { describe, expect, it } from "vitest";
import {
  appendUnsubscribeFooter,
  createUnsubscribeLinker,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";

const SECRET = "s".repeat(40);

describe("unsubscribe tokens", () => {
  it("round-trips and normalizes the address", () => {
    const token = signUnsubscribeToken(SECRET, {
      organisationId: "org-1",
      email: " Jamie@Acme.com ",
      campaignId: "c-1",
    });
    expect(verifyUnsubscribeToken(SECRET, token)).toEqual({
      organisationId: "org-1",
      email: "jamie@acme.com",
      campaignId: "c-1",
    });
  });

  it("rejects tampering, a wrong secret, and malformed tokens", () => {
    const token = signUnsubscribeToken(SECRET, { organisationId: "org-1", email: "a@x.com" });
    const [data, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ o: "org-1", e: "victim@x.com" })).toString(
      "base64url",
    );
    expect(verifyUnsubscribeToken(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken("x".repeat(40), token)).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, data)).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, `${token}.extra`)).toBeNull();
  });
});

describe("links and footer", () => {
  it("builds page and one-click URLs from APP_URL without a double slash", () => {
    const links = createUnsubscribeLinker({ appUrl: "https://app.example.com/", secret: SECRET })({
      organisationId: "org-1",
      email: "a@x.com",
    });
    expect(links.pageUrl).toMatch(/^https:\/\/app\.example\.com\/unsubscribe\/[\w.-]+$/);
    expect(links.oneClickUrl).toMatch(/^https:\/\/app\.example\.com\/api\/unsubscribe\/[\w.-]+$/);
  });

  it("appends an embedded link once", () => {
    const once = appendUnsubscribeFooter("Hello\n\nBest,\nAlex\n", "https://x.test/unsubscribe/t");
    expect(once).toBe(
      "Hello\n\nBest,\nAlex\n\nNo longer interested in these messages? [Unsubscribe](https://x.test/unsubscribe/t)",
    );
    expect(appendUnsubscribeFooter(once, "https://x.test/unsubscribe/t")).toBe(once);
  });
});
