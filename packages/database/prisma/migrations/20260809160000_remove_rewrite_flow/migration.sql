-- Removes the AI rewrite flow (shorter/formal/direct). Generation is now a
-- two-prompt pipeline: generation + QA review, with what an email says and how
-- it looks coming from the campaign prompt.
--
-- DESTRUCTIVE: "EmailDraft"."rewriteStyle" records which rewrite produced a
-- historical draft. Dropping it loses that label on existing drafts (the
-- drafts themselves, and their basedOnDraftId lineage, are untouched).

ALTER TABLE "Organisation" DROP COLUMN "rewriteSystemPrompt";

ALTER TABLE "EmailDraft" DROP COLUMN "rewriteStyle";

DROP TYPE "EmailRewriteStyle";
