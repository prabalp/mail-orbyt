import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/**
 * The SDK's own Zod->JSON-Schema conversion (zod-to-json-schema, used for
 * every tool's advertised inputSchema/outputSchema) stamps
 * `"$schema": "http://json-schema.org/draft-07/schema#"` on every schema it
 * emits — hardcoded, not configurable through registerTool's public API.
 * The schemas it produces are structurally fine (plain object/string/array
 * shapes validate identically under either dialect here), but at least one
 * real MCP client — the one this bug was actually caught with — enforces
 * that the declared dialect literally IS 2020-12 and refuses to call ANY
 * tool with an outputSchema otherwise, with every call failing before it
 * ever reaches the handler. That's silent and total: not a per-tool
 * degradation, every tool advertising an outputSchema stops working for
 * that client.
 *
 * There's no supported hook to change the dialect the SDK stamps, so this
 * intercepts the already-registered `tools/list` handler and rewrites the
 * `$schema` field on every tool's schemas in the response it produces,
 * rather than re-implementing tool listing ourselves (which would drift
 * from whatever the SDK's own logic does on 1.30.0 → up the line as we
 * upgrade).
 */
export function fixToolSchemaDialect(server: McpServer): void {
  const protocol = server.server as unknown as {
    _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<unknown>>;
  };

  const method = "tools/list";
  const original = protocol._requestHandlers.get(method);
  if (!original) {
    throw new Error(
      "fixToolSchemaDialect: no tools/list handler was registered yet — call this after every registerTool call.",
    );
  }

  server.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = (await original(request, extra)) as {
      tools?: Array<{
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
    };

    for (const tool of result.tools ?? []) {
      if (tool.inputSchema) tool.inputSchema.$schema = JSON_SCHEMA_2020_12;
      if (tool.outputSchema) tool.outputSchema.$schema = JSON_SCHEMA_2020_12;
    }

    return result;
  });
}
