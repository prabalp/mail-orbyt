/** Maps directly onto the OAuth 2.1 `error` field returned from the token endpoint. */
export class OAuthGrantError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthGrantError";
    this.code = code;
  }
}
