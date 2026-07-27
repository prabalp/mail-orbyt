import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  GoogleOAuthError,
  refreshAccessToken,
  revokeToken,
} from "./google-oauth";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://app.example/api/gmail/oauth/callback",
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("buildAuthorizationUrl", () => {
  it("includes the client id, redirect uri, gmail scopes, and state", () => {
    const url = new URL(buildAuthorizationUrl(CONFIG, "csrf-state-value"));
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("state")).toBe("csrf-state-value");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("gmail.send");
  });
});

describe("exchangeCodeForTokens", () => {
  it("returns parsed tokens on success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      );
    const tokens = await exchangeCodeForTokens(CONFIG, "auth-code", fetchImpl);
    expect(tokens).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSeconds: 3600 });
  });

  it("throws GoogleOAuthError on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 400));
    await expect(exchangeCodeForTokens(CONFIG, "bad-code", fetchImpl)).rejects.toBeInstanceOf(
      GoogleOAuthError,
    );
  });

  it("throws GoogleOAuthError when the response is missing required fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access_token: "at" }));
    await expect(exchangeCodeForTokens(CONFIG, "auth-code", fetchImpl)).rejects.toBeInstanceOf(
      GoogleOAuthError,
    );
  });
});

describe("refreshAccessToken", () => {
  it("returns a new access token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: "new-at", expires_in: 3600 }));
    const result = await refreshAccessToken(CONFIG, "rt", fetchImpl);
    expect(result).toEqual({ accessToken: "new-at", expiresInSeconds: 3600 });
  });

  it("throws GoogleOAuthError on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    await expect(refreshAccessToken(CONFIG, "rt", fetchImpl)).rejects.toBeInstanceOf(
      GoogleOAuthError,
    );
  });
});

describe("fetchGoogleUserEmail", () => {
  it("returns the connected mailbox's email", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ email: "jamie@acme.example", name: "Jamie" }));
    const result = await fetchGoogleUserEmail("at", fetchImpl);
    expect(result).toEqual({ email: "jamie@acme.example", name: "Jamie" });
  });

  it("throws GoogleOAuthError when no email is returned", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ name: "Jamie" }));
    await expect(fetchGoogleUserEmail("at", fetchImpl)).rejects.toBeInstanceOf(GoogleOAuthError);
  });
});

describe("revokeToken", () => {
  it("never throws even if the request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(revokeToken("at", fetchImpl)).resolves.toBeUndefined();
  });
});
