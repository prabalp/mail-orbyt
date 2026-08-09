-- Lets an organisation bring its own AI provider key and pin its own model,
-- instead of every organisation sharing the deployment's AI_PROVIDER_API_KEY
-- and AI_PROVIDER_MODEL. Both columns are nullable and null means "fall back
-- to the environment", so existing organisations keep working unchanged.
--
-- "aiProviderApiKey" holds AES-256-GCM ciphertext (iv:authTag:ciphertext,
-- base64, colon-joined) under TOKEN_ENCRYPTION_KEY — never a plaintext key.
-- Rotating TOKEN_ENCRYPTION_KEY makes stored keys undecryptable; callers treat
-- that as "no org key" and fall back to the environment.

ALTER TABLE "Organisation" ADD COLUMN "aiProviderApiKey" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "aiProviderModel" TEXT;
