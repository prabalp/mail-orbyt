import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));

const { buildLinkToolHandler, buildToolHandler, ToolScopeError } = await import("./registry");
const { ALL_LINK_TOOLS, ALL_TOOLS } = await import("./index");
type AuthenticatedActor = import("../auth-middleware").AuthenticatedActor;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function actorWithScope(scope: string): AuthenticatedActor {
  return {
    userId: "user_1",
    organisationId: "org_1",
    scope,
    clientId: "client_1",
    rawToken: "token_abc",
  };
}

/**
 * Every declared requiredScope is asserted twice: a connection that DOESN'T
 * hold it is rejected before any network call, and one that DOES hold it is
 * allowed through to the fetch. This is what would have caught a descriptor
 * whose requiredScope was typo'd to something the connection always holds
 * (e.g. "profile" on a tool that should require "leads:manage") — the
 * integrity test only checks the scope string is valid, not that it's the
 * RIGHT one, so this is the enforcement half.
 */
describe("scope enforcement", () => {
  const emptyOkResponse = () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  it.each(ALL_TOOLS)("$name rejects a connection without $requiredScope", async (descriptor) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const actor = actorWithScope("__no_scopes_granted__");
    await expect(buildToolHandler(descriptor)({}, actor)).rejects.toThrow(ToolScopeError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(ALL_TOOLS)(
    "$name allows a connection holding $requiredScope through to fetch",
    async (descriptor) => {
      const fetchSpy = vi.fn().mockResolvedValue(emptyOkResponse());
      vi.stubGlobal("fetch", fetchSpy);

      const actor = actorWithScope(descriptor.requiredScope);
      // Path params are required for the URL to build cleanly, but their
      // actual value doesn't matter for a scope check — any string does.
      const params: Record<string, unknown> = Object.fromEntries(
        [...descriptor.pathTemplate.matchAll(/\{(\w+)\}/g)]
          .map((match) => match[1]!)
          .filter((name) => name !== "organisationId")
          .map((name) => [name, "x"]),
      );

      // The one multipart descriptor destructures fileContentBase64 and
      // base64-decodes it before fetch is ever called — supply a valid value
      // so the scope check (not multipart encoding) is what's under test.
      if (descriptor.encode === "multipart") {
        params.fileName = "test.csv";
        params.fileContentBase64 = Buffer.from("a,b\n1,2").toString("base64");
      }

      await buildToolHandler(descriptor)(params, actor).catch(() => {
        // A downstream fetch/parse failure is fine here — only whether the
        // scope check let the call through to fetch() is under test.
      });
      expect(fetchSpy).toHaveBeenCalled();
    },
  );

  it.each(ALL_LINK_TOOLS)(
    "$name rejects a connection without $requiredScope",
    async (descriptor) => {
      const actor = actorWithScope("__no_scopes_granted__");
      await expect(buildLinkToolHandler(descriptor)({}, actor)).rejects.toThrow(ToolScopeError);
    },
  );

  it.each(ALL_LINK_TOOLS)(
    "$name allows a connection holding $requiredScope",
    async (descriptor) => {
      const actor = actorWithScope(descriptor.requiredScope);
      await expect(buildLinkToolHandler(descriptor)({}, actor)).resolves.toBeTypeOf("string");
    },
  );
});
