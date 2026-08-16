import { describe, expect, it } from "vitest";

/**
 * Regression test for a bug caught in production: zod-to-json-schema (used
 * internally by @modelcontextprotocol/sdk's registerTool to advertise every
 * tool's input/output schema) hardcodes `"$schema":
 * "http://json-schema.org/draft-07/schema#"`. At least one real MCP client
 * enforces the declared dialect literally IS 2020-12 and refuses to call
 * ANY tool advertising an outputSchema otherwise — every call failed before
 * reaching the handler, silently, for every tool with a declared
 * outputSchema. fixToolSchemaDialect (applied in create-server.ts after all
 * tools are registered) is supposed to rewrite the dialect on the way out;
 * this asserts it actually does, end to end, through a real McpServer
 * instance rather than unit-testing the rewrite function in isolation.
 */
const { createMcpServer } = await import("./create-server");
type AuthenticatedActor = import("./auth-middleware").AuthenticatedActor;

const actor: AuthenticatedActor = {
  userId: "user_1",
  organisationId: "org_1",
  scope: "profile leads:manage campaigns:manage",
  clientId: "client_1",
  rawToken: "token_abc",
};

describe("tool schema dialect", () => {
  it("advertises 2020-12, never draft-07, on every tool with a declared schema", async () => {
    const server = createMcpServer(actor);
    const protocol = server.server as unknown as {
      _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
    };

    const handler = protocol._requestHandlers.get("tools/list");
    expect(handler).toBeDefined();

    const result = (await handler!({ method: "tools/list", params: {} }, {})) as {
      tools: Array<{ name: string; inputSchema?: { $schema?: string }; outputSchema?: { $schema?: string } }>;
    };

    expect(result.tools.length).toBeGreaterThan(0);

    const draft07Offenders = result.tools.filter(
      (tool) =>
        tool.inputSchema?.$schema?.includes("draft-07") ||
        tool.outputSchema?.$schema?.includes("draft-07"),
    );
    expect(draft07Offenders.map((t) => t.name)).toEqual([]);

    const toolsWithOutputSchema = result.tools.filter((tool) => tool.outputSchema);
    expect(toolsWithOutputSchema.length).toBeGreaterThan(0);
    for (const tool of toolsWithOutputSchema) {
      expect(tool.outputSchema!.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
    for (const tool of result.tools) {
      expect(tool.inputSchema?.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    }
  });
});
