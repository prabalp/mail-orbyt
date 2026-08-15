import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { createLogger } from "@mail-orbyt/logging";
import type { AuthenticatedActor } from "./auth-middleware.js";
import { ALL_LINK_TOOLS, ALL_TOOLS } from "./tools/index.js";
import {
  buildLinkToolHandler,
  buildToolHandler,
  ToolRequestError,
  ToolScopeError,
  type LinkToolDescriptor,
  type RouteToolDescriptor,
} from "./tools/registry.js";
import { recordToolInvocation } from "./audit.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

const logger = createLogger({ service: "mcp-server" });

type ToolHandler = (input: Record<string, unknown>, actor: AuthenticatedActor) => Promise<string>;

/**
 * The MCP spec's structured output must be a JSON *object*. Tool responses
 * that are a bare array (or CSV text) are wrapped rather than dropped, so a
 * descriptor can still declare an output schema for them.
 */
function toStructuredContent(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }

  if (Array.isArray(parsed)) return { items: parsed };
  if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
  return {};
}

function registerToolHandler(
  server: McpServer,
  actor: AuthenticatedActor,
  descriptor: RouteToolDescriptor | LinkToolDescriptor,
  handler: ToolHandler,
): void {
  const config: {
    title?: string;
    description: string;
    inputSchema: ZodRawShape;
    outputSchema?: ZodTypeAny;
    annotations?: Record<string, unknown>;
  } = {
    description: descriptor.description,
    inputSchema: descriptor.inputShape,
  };

  if (descriptor.title) config.title = descriptor.title;
  if (descriptor.outputShape) {
    // A descriptor's outputShape is a plain ZodRawShape — a bag of
    // top-level fields, deliberately non-exhaustive (see registry.ts).
    // Handing that raw shape straight to the SDK makes it build a STRICT
    // z.object() internally (unknownKeys "strip"), which the SDK's own
    // zod->JSON-Schema conversion then renders as `additionalProperties:
    // false`. The server's own zod validation silently strips extra keys
    // and never notices, but a client validating structuredContent against
    // that advertised JSON Schema (as the reference SDK Client does) HARD
    // REJECTS any real REST response with fields beyond what we declared —
    // which is every real REST response, since the whole point of this
    // shape is to describe a reliable subset, not the exhaustive one.
    // Wrapping it in `.passthrough()` ourselves, before the SDK ever sees a
    // raw shape, is what actually produces `additionalProperties: true`.
    config.outputSchema = z.object(descriptor.outputShape).passthrough();
  }
  if (descriptor.annotations) {
    config.annotations = { ...descriptor.annotations, title: descriptor.title };
  }

  server.registerTool(descriptor.name, config, async (args: Record<string, unknown>) => {
    const startedAt = process.hrtime.bigint();
    const elapsedMs = (): number => Number(process.hrtime.bigint() - startedAt) / 1e6;

    try {
      const text = await handler(args, actor);

      logger.info("mcp tool ok", {
        tool: descriptor.name,
        organisationId: actor.organisationId,
        durationMs: Math.round(elapsedMs()),
      });
      void recordToolInvocation(actor, descriptor.name, "ok");

      // Only attach structuredContent when a schema was declared: the SDK
      // validates it and fails the whole call on a mismatch, so an
      // undeclared tool must not opt itself in by accident.
      return descriptor.outputShape
        ? {
            content: [{ type: "text" as const, text }],
            structuredContent: toStructuredContent(text),
          }
        : { content: [{ type: "text" as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const outcome =
        error instanceof ToolScopeError
          ? "forbidden"
          : error instanceof ToolRequestError && error.retryable
            ? "upstream_error"
            : "error";

      logger.warn("mcp tool failed", {
        tool: descriptor.name,
        organisationId: actor.organisationId,
        durationMs: Math.round(elapsedMs()),
        outcome,
        status: error instanceof ToolRequestError ? error.status : undefined,
      });
      void recordToolInvocation(actor, descriptor.name, outcome);

      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });
}

/** Every list response shares this envelope — see the pagination note in docs/mcp-server.md. */
export const PAGINATED_OUTPUT_SHAPE: ZodRawShape = {
  totalCount: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
};

/**
 * Builds a fresh MCP server instance per request, with every tool's handler
 * closed over the CALLING request's authenticated actor. This app runs
 * stateless (see index.ts's `sessionIdGenerator: undefined`), so there is no
 * server-side session to thread auth context through — the closure does
 * that instead, which also means two concurrent requests from different
 * users can never cross-contaminate.
 */
export function createMcpServer(actor: AuthenticatedActor): McpServer {
  const server = new McpServer(
    { name: "mail-orbyt", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  for (const descriptor of ALL_TOOLS) {
    registerToolHandler(server, actor, descriptor, buildToolHandler(descriptor));
  }

  for (const descriptor of ALL_LINK_TOOLS) {
    registerToolHandler(server, actor, descriptor, buildLinkToolHandler(descriptor));
  }

  registerResources(server, actor);
  registerPrompts(server);

  return server;
}
