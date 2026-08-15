import { recordAuditEvent } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { createLogger } from "@mail-orbyt/logging";
import type { AuthenticatedActor } from "./auth-middleware.js";

const logger = createLogger({ service: "mcp-server" });

export type ToolOutcome = "ok" | "forbidden" | "error" | "upstream_error";

/**
 * Records that an AI client invoked a tool, for the same security review the
 * web UI's own writes get. Only the tool NAME, client, and outcome are
 * stored — never the arguments, which routinely contain lead emails and
 * draft copy that have no business in an audit row.
 *
 * Deliberately fire-and-forget: an audit-log write must never turn a
 * succeeded tool call into a failed one from the caller's point of view. A
 * failure to record is logged loudly instead.
 */
export async function recordToolInvocation(
  actor: AuthenticatedActor,
  tool: string,
  outcome: ToolOutcome,
): Promise<void> {
  try {
    await recordAuditEvent(prisma, {
      type: "MCP_TOOL_INVOKED",
      organisationId: actor.organisationId,
      userId: actor.userId,
      metadata: { tool, outcome, clientId: actor.clientId },
    });
  } catch (error) {
    logger.error("failed to record MCP tool audit event", {
      tool,
      outcome,
      organisationId: actor.organisationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
