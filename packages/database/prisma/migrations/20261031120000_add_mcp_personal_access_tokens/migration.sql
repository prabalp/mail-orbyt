-- Personal access tokens: a user-chosen label on hand-created MCP access tokens.
ALTER TABLE "McpAccessToken" ADD COLUMN "name" TEXT;
