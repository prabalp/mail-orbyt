/**
 * Social platform OAuth token encryption. Same rationale as
 * packages/gmail/src/token-crypto.ts: the implementation lives in
 * @mail-orbyt/ai-settings's secret-crypto so every secret at rest (Gmail
 * tokens, an org's AI provider key, social platform tokens) is protected by
 * the same AES-256-GCM scheme and the same TOKEN_ENCRYPTION_KEY — there is
 * one crypto implementation in the monorepo, not several. These aliases keep
 * the social-flavoured names this package's call sites use.
 */
export {
  encryptSecret as encryptSocialToken,
  decryptSecret as decryptSocialToken,
  SecretDecryptionError as SocialTokenDecryptionError,
} from "@mail-orbyt/ai-settings";
