import { describe, expect, it, vi } from "vitest";
import { findKnownResource, listKnownResources } from "./resources";

describe("findKnownResource", () => {
  it("returns the registered resource for a known URI", async () => {
    const prisma = {
      mcpResource: {
        findUnique: vi.fn().mockResolvedValue({
          resourceUri: "urn:orbyt:lead-orbyt-mcp-server",
          displayName: "Lead Orbyt",
          backendKind: "NATIVE_INTROSPECTED",
        }),
      },
    };

    const resource = await findKnownResource(prisma, "urn:orbyt:lead-orbyt-mcp-server");
    expect(resource).toEqual({
      resourceUri: "urn:orbyt:lead-orbyt-mcp-server",
      displayName: "Lead Orbyt",
      backendKind: "NATIVE_INTROSPECTED",
    });
  });

  it("returns null for an unregistered URI", async () => {
    const prisma = { mcpResource: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await findKnownResource(prisma, "urn:orbyt:unknown")).toBeNull();
  });
});

describe("listKnownResources", () => {
  it("lists every registered resource, oldest first", async () => {
    const prisma = {
      mcpResource: {
        findMany: vi.fn().mockResolvedValue([
          {
            resourceUri: "urn:orbyt:mail-orbyt-mcp-server",
            displayName: "Mail Orbyt",
            backendKind: "NATIVE_LOCAL",
          },
        ]),
      },
    };

    const resources = await listKnownResources(prisma);
    expect(resources).toHaveLength(1);
    expect(prisma.mcpResource.findMany).toHaveBeenCalledWith({
      select: { resourceUri: true, displayName: true, backendKind: true },
      orderBy: { createdAt: "asc" },
    });
  });
});
