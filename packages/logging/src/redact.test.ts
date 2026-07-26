import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("redacts known sensitive keys", () => {
    const result = redact({
      accessToken: "ya29.abc",
      refreshToken: "1//abc",
      password: "hunter2",
      apiKey: "sk-123",
      safeField: "keep me",
    }) as Record<string, unknown>;

    expect(result.accessToken).toBe("[REDACTED]");
    expect(result.refreshToken).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.safeField).toBe("keep me");
  });

  it("redacts nested sensitive keys", () => {
    const result = redact({
      oauth: { accessToken: "secret", scope: "gmail.send" },
    }) as { oauth: Record<string, unknown> };

    expect(result.oauth.accessToken).toBe("[REDACTED]");
    expect(result.oauth.scope).toBe("gmail.send");
  });

  it("redacts within arrays", () => {
    const result = redact([{ token: "abc" }, { token: "def" }]) as Record<string, unknown>[];
    expect(result[0]?.token).toBe("[REDACTED]");
    expect(result[1]?.token).toBe("[REDACTED]");
  });

  it("redacts full email body fields", () => {
    const result = redact({ body: "Hi John, ...", htmlBody: "<p>Hi</p>" }) as Record<
      string,
      unknown
    >;
    expect(result.body).toBe("[REDACTED]");
    expect(result.htmlBody).toBe("[REDACTED]");
  });

  it("preserves Error name/message/stack without redacting", () => {
    const err = new Error("boom");
    const result = redact(err) as Record<string, unknown>;
    expect(result.message).toBe("boom");
    expect(result.name).toBe("Error");
  });

  it("passes through primitives and null unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
    expect(redact("hello")).toBe("hello");
  });
});
