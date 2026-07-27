/**
 * Raw OAuth 2.0 + Gmail userinfo calls against Google's endpoints. Uses a
 * separate OAuth client (GMAIL_OAUTH_CLIENT_ID/SECRET) from application
 * login (packages/authentication's GOOGLE_LOGIN_* client) — connecting a
 * sending inbox must never reuse or grant scope to the login session.
 */

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

// gmail.send to send mail, gmail.readonly for future reply-detection
// (Phase 9), openid/email/profile to identify which mailbox was connected.
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
  "profile",
];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildAuthorizationUrl(
  config: Pick<GoogleOAuthConfig, "clientId" | "redirectUri">,
  state: string,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export class GoogleOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokens> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new GoogleOAuthError(`Token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || !data.refresh_token || !data.expires_in) {
    throw new GoogleOAuthError(
      "Token exchange response was missing access_token/refresh_token/expires_in.",
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
  };
}

export async function refreshAccessToken(
  config: Pick<GoogleOAuthConfig, "clientId" | "clientSecret">,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new GoogleOAuthError(`Access token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token || !data.expires_in) {
    throw new GoogleOAuthError("Refresh response was missing access_token/expires_in.");
  }

  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/** Best-effort revocation — called when a user disconnects an inbox so the token can't be used afterward even if our copy leaks. Disconnection proceeds regardless of whether revocation succeeds. */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

export async function fetchGoogleUserEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: string; name?: string }> {
  const response = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new GoogleOAuthError(`Fetching Google user info failed with status ${response.status}`);
  }

  const data = (await response.json()) as { email?: string; name?: string };
  if (!data.email) {
    throw new GoogleOAuthError("Google user info response was missing an email address.");
  }

  return { email: data.email, name: data.name };
}
