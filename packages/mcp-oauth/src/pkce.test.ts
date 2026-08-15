import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPkce } from "./pkce";

function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("verifyPkce", () => {
  it("accepts a matching S256 challenge", () => {
    const verifier = "a-random-code-verifier-value";
    expect(verifyPkce(verifier, challengeFor(verifier), "S256")).toBe(true);
  });

  it("rejects a mismatched verifier", () => {
    expect(verifyPkce("wrong-verifier", challengeFor("correct-verifier"), "S256")).toBe(false);
  });

  it("rejects the plain method", () => {
    const verifier = "some-verifier";
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });

  it("rejects an empty verifier", () => {
    expect(verifyPkce("", challengeFor(""), "S256")).toBe(false);
  });
});
