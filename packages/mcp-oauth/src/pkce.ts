import { createHash } from "node:crypto";

/**
 * RFC 7636 PKCE verification. Only the S256 challenge method is supported —
 * "plain" is rejected outright, since a public client (no client secret;
 * see McpOAuthClient) relies entirely on PKCE to prove that whoever
 * exchanges the code is the same party that started the flow.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  codeChallengeMethod: string,
): boolean {
  if (codeChallengeMethod !== "S256") return false;
  if (!codeVerifier) return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}
