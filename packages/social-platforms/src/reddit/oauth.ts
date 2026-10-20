/**
 * OAuth 2.0 against Reddit's endpoints. Reddit requires a descriptive,
 * unique User-Agent on every API call (including token requests) or it will
 * aggressively rate-limit/block the client — hence `REDDIT_USER_AGENT` is
 * part of this config rather than a hardcoded string.
 */

const AUTHORIZATION_ENDPOINT = "https://www.reddit.com/api/v1/authorize";
const TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";

// identity to fetch the connected username, read to poll mentions/unread
// messages, submit to post/comment, privatemessages for DM-style unread mail.
const REDDIT_SCOPES = ["identity", "read", "submit", "privatemessages"];

export interface RedditOAuthConfig {
  clientId: string;
  clientSecret: string;
  userAgent: string;
}

export class RedditOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedditOAuthError";
  }
}

export function buildAuthorizationUrl(
  config: Pick<RedditOAuthConfig, "clientId">,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  // "permanent" duration is required to receive a refresh_token.
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", REDDIT_SCOPES.join(" "));
  return url.toString();
}

interface RedditTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scopes: string[];
}

function basicAuthHeader(config: RedditOAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

export async function exchangeCodeForTokens(
  config: RedditOAuthConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(config),
      "User-Agent": config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new RedditOAuthError(`Token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new RedditOAuthError("Token exchange response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : REDDIT_SCOPES,
  };
}

export async function refreshAccessToken(
  config: RedditOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(config),
      "User-Agent": config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new RedditOAuthError(`Access token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new RedditOAuthError("Refresh response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : REDDIT_SCOPES,
  };
}
