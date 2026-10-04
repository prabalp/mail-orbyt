export {
  AUTHORIZATION_CODE_TTL_MS,
  DEFAULT_ACCESS_TOKEN_TTL_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  EXCHANGED_ACCESS_TOKEN_TTL_MS,
  MAIL_ORBYT_MCP_RESOURCE_URI,
  LEAD_ORBYT_MCP_RESOURCE_URI,
  TOKEN_EXCHANGE_GRANT_TYPE,
  ACCESS_TOKEN_TYPE,
  RESOURCE_KIND_GATEWAY,
} from "./constants";
export { OAuthGrantError } from "./errors";
export type { Permission } from "@mail-orbyt/authentication";
export { verifyPkce } from "./pkce";
export {
  parseScope,
  scopeIncludes,
  scopesGrantedByRole,
  intersectScopes,
  PROFILE_SCOPE,
  LEADS_READ_SCOPE,
  ALL_SCOPES,
} from "./scopes";
export {
  registerClient,
  type RegisterClientParams,
  type RegisteredClient,
} from "./client-registration";
export { createAuthorizationCode, type CreateAuthorizationCodeParams } from "./authorization-code";
export {
  exchangeAuthorizationCode,
  refreshAccessToken,
  type ExchangeAuthorizationCodeParams,
  type RefreshAccessTokenParams,
} from "./exchange";
export { issueTokenPair, type TokenPairResult, type IssueTokenPairParams } from "./issue-tokens";
export { verifyAccessToken, type VerifiedAccessToken } from "./verify";
export {
  revokeToken,
  listActiveConnections,
  revokeConnection,
  type McpConnectionSummary,
} from "./connections";
export {
  findResource,
  ensureMcpResources,
  resolveAuthorizeResource,
  applyResourceScopeMapping,
  allowedScopesFromMapping,
  type ResolvedResource,
} from "./resources";
export {
  findActivePlatformGrant,
  createPlatformGrant,
  revokePlatformGrants,
} from "./platform-grants";
export {
  exchangeTokenForResource,
  type TokenExchangeParams,
  type TokenExchangeResult,
} from "./token-exchange";
export { introspectAccessToken, type IntrospectionResult } from "./introspect";
export {
  createIntrospectionClient,
  authenticateIntrospectionClient,
  parseBasicAuth,
  type CreatedIntrospectionClient,
} from "./introspection-client";
