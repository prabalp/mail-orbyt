/**
 * OAuth 2.0 with mandatory PKCE against X/Twitter's endpoints.
 */
import { createHash, randomBytes } from "node:crypto";

const AUTHORIZATION_ENDPOINT = "https://twitter.com/i/oauth2/authorize";
const TOKEN_ENDPOINT = "https://api.twitter.com/2/oauth2/token";

// tweet.read/write to post and reply, users.read to identify the connected
// account, offline.access to receive a refresh token.
const TWITTER_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

export interface TwitterOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export class TwitterOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwitterOAuthError";
  }
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates a PKCE code_verifier. Caller must persist it (e.g. alongside `state`) until the callback. */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

/** Derives the S256 code_challenge for a given code_verifier. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

export function buildAuthorizationUrl(
  config: Pick<TwitterOAuthConfig, "clientId">,
  state: string,
  redirectUri: string,
  codeChallenge: string,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", TWITTER_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TwitterTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scopes: string[];
}

function basicAuthHeader(config: TwitterOAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

export async function exchangeCodeForTokens(
  config: TwitterOAuthConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TwitterTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(config),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: config.clientId,
    }),
  });

  if (!response.ok) {
    throw new TwitterOAuthError(`Token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new TwitterOAuthError("Token exchange response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : TWITTER_SCOPES,
  };
}

export async function refreshAccessToken(
  config: TwitterOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TwitterTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(config),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
    }),
  });

  if (!response.ok) {
    throw new TwitterOAuthError(`Access token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new TwitterOAuthError("Refresh response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : TWITTER_SCOPES,
  };
}
