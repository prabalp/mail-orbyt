import { describe, expect, it, vi } from "vitest";
import { MAIL_ORBYT_MCP_RESOURCE_URI } from "./constants";
import { resolveAuthorizeResource } from "./resources";

function fakePrisma() {
  const findUnique = vi.fn(async ({ where }: { where: { resourceUri: string } }) =>
    where.resourceUri === MAIL_ORBYT_MCP_RESOURCE_URI
      ? {
          resourceUri: where.resourceUri,
          name: "Mail Orbyt",
          kind: "native-local",
          scopeMapping: null,
        }
      : null,
  );
  return { prisma: { mcpResource: { findUnique } } as never, findUnique };
}

const mcpServerUrl = "https://mcp.example.com/";

describe("resolveAuthorizeResource", () => {
  it.each([
    [null],
    ["https://mcp.example.com"],
    ["https://mcp.example.com/"],
    ["https://mcp.example.com/mcp"],
    ["https://mcp.example.com/mcp/"],
  ])("maps %s to mail-orbyt's own resource", async (requested) => {
    const { prisma } = fakePrisma();
    const resolved = await resolveAuthorizeResource(prisma, { requested, mcpServerUrl });
    expect(resolved?.resourceUri).toBe(MAIL_ORBYT_MCP_RESOURCE_URI);
  });

  it("rejects an unregistered resource", async () => {
    const { prisma } = fakePrisma();
    const resolved = await resolveAuthorizeResource(prisma, {
      requested: "https://evil.example.com/mcp",
      mcpServerUrl,
    });
    expect(resolved).toBeNull();
  });
});
