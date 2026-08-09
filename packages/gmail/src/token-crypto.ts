/**
 * Gmail OAuth token encryption. The implementation moved to
 * @mail-orbyt/ai-settings' secret-crypto so that an organisation's own AI
 * provider API key is protected by exactly the same scheme and the same
 * TOKEN_ENCRYPTION_KEY — there is one AES-256-GCM implementation in the
 * monorepo, not two. These aliases keep the Gmail-flavoured names its call
 * sites already use.
 */
export {
  encryptSecret as encryptToken,
  decryptSecret as decryptToken,
  SecretDecryptionError as TokenDecryptionError,
} from "@mail-orbyt/ai-settings";
