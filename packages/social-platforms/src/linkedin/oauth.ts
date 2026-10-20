/**
 * Raw OAuth 2.0 calls against LinkedIn's endpoints. Mirrors the style of
 * packages/gmail/src/google-oauth.ts.
 */

const AUTHORIZATION_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken";

// openid/profile/email to identify which member connected the account,
// w_member_social to post and reply on their behalf.
const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export class LinkedInOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInOAuthError";
  }
}

export function buildAuthorizationUrl(
  config: Pick<LinkedInOAuthConfig, "clientId">,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

interface LinkedInTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  scopes: string[];
}

export async function exchangeCodeForTokens(
  config: LinkedInOAuthConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new LinkedInOAuthError(`Token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new LinkedInOAuthError("Token exchange response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : LINKEDIN_SCOPES,
  };
}

/**
 * Refreshes a LinkedIn access token using its refresh token. NOTE: LinkedIn
 * only issues refresh tokens (and only honours this grant) for apps that
 * have been granted the "Sign In with LinkedIn using OpenID Connect" +
 * refresh_token_hover / "Programmatic Refresh Token" access by LinkedIn —
 * this is a manually-approved product on the developer app, not available by
 * default. Until that access is granted, `exchangeCodeForTokens` will not
 * return a refresh_token and callers must re-run the authorization flow when
 * the (typically 60-day) access token expires.
 */
export async function refreshAccessToken(
  config: LinkedInOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedInTokenResponse> {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new LinkedInOAuthError(`Access token refresh failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token || !data.expires_in) {
    throw new LinkedInOAuthError("Refresh response was missing access_token/expires_in.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresInSeconds: data.expires_in,
    scopes: data.scope ? data.scope.split(" ") : LINKEDIN_SCOPES,
  };
}
