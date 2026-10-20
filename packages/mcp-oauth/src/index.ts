export {
  AUTHORIZATION_CODE_TTL_MS,
  DEFAULT_ACCESS_TOKEN_TTL_MS,
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  RESOURCE_SCOPED_ACCESS_TOKEN_TTL_MS,
  MAIL_ORBYT_MCP_RESOURCE_URI,
  LEAD_ORBYT_MCP_RESOURCE_URI,
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
  exchangeTokenForResource,
  type ExchangeAuthorizationCodeParams,
  type RefreshAccessTokenParams,
  type ExchangeTokenForResourceParams,
} from "./exchange";
export {
  issueTokenPair,
  issueResourceScopedAccessToken,
  type TokenPairResult,
  type IssueTokenPairParams,
  type ResourceScopedTokenResult,
  type IssueResourceScopedAccessTokenParams,
} from "./issue-tokens";
export { verifyAccessToken, type VerifiedAccessToken } from "./verify";
export {
  revokeToken,
  listActiveConnections,
  revokeConnection,
  type McpConnectionSummary,
} from "./connections";
export {
  findActivePlatformGrant,
  completeAuthorization,
  ensurePlatformGrantId,
  revokePlatformGrant,
  type ActivePlatformGrant,
  type CompleteAuthorizationParams,
} from "./platform-grants";
export { findKnownResource, listKnownResources, type KnownResource } from "./resources";
export {
  createIntrospectionClient,
  verifyIntrospectionClient,
  type CreateIntrospectionClientResult,
} from "./introspection-clients";
export { introspectToken, type IntrospectionResult } from "./introspection";
