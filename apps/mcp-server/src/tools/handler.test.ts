import { afterEach, describe, expect, it, vi } from "vitest";

// registry.ts calls loadEnv() for APP_URL on every handler invocation; the
// real schema (packages/config) requires a full production-shaped
// environment (DATABASE_URL, REDIS_URL, OAuth client secrets, ...) that has
// no business existing in a unit test for path-templating and error
// mapping. Stubbing the module keeps this test about buildToolHandler's own
// logic, not about assembling a valid environment.
vi.mock("@mail-orbyt/config", () => ({
  loadEnv: () => ({ APP_URL: "http://localhost:3000" }),
}));

const { buildToolHandler, ToolRequestError, ToolScopeError } = await import("./registry");
type RouteToolDescriptor = import("./registry").RouteToolDescriptor;
type AuthenticatedActor = import("../auth-middleware").AuthenticatedActor;

const actor: AuthenticatedActor = {
  userId: "user_1",
  organisationId: "org_1",
  scope: "profile leads:manage",
  clientId: "client_1",
  rawToken: "token_abc",
};

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildToolHandler", () => {
  it("fails fast on a missing scope without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const descriptor: RouteToolDescriptor = {
      name: "delete_lead",
      description: "test",
      method: "DELETE",
      pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}",
      requiredScope: "organisation:delete",
      inputShape: {},
    };

    await expect(buildToolHandler(descriptor)({ leadId: "lead_1" }, actor)).rejects.toThrow(
      ToolScopeError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fills path params and injects organisationId from the actor, not the input", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    const descriptor: RouteToolDescriptor = {
      name: "get_lead",
      description: "test",
      method: "GET",
      pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}",
      requiredScope: "profile",
      inputShape: {},
    };

    // Even if a caller tried to smuggle a different organisationId through
    // input, the path is built from actor.organisationId only.
    await buildToolHandler(descriptor)(
      { leadId: "lead_1", organisationId: "someone-elses-org" },
      actor,
    );

    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/organisations/org_1/leads/lead_1");
  });

  it("routes GET input fields to a query string, not the body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ leads: [] }));
    vi.stubGlobal("fetch", fetchSpy);

    const descriptor: RouteToolDescriptor = {
      name: "list_leads",
      description: "test",
      method: "GET",
      pathTemplate: "/api/organisations/{organisationId}/leads",
      requiredScope: "profile",
      inputShape: {},
    };

    await buildToolHandler(descriptor)({ search: "acme", page: 2 }, actor);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://localhost:3000/api/organisations/org_1/leads?search=acme&page=2");
    expect(init.body).toBeUndefined();
  });

  it("routes non-GET input fields to a JSON body with the bearer token", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ status: "ok" }));
    vi.stubGlobal("fetch", fetchSpy);

    const descriptor: RouteToolDescriptor = {
      name: "add_suppression",
      description: "test",
      method: "POST",
      pathTemplate: "/api/organisations/{organisationId}/suppressions",
      requiredScope: "leads:manage",
      inputShape: {},
    };

    await buildToolHandler(descriptor)({ value: "a@b.com", reason: "UNSUBSCRIBE" }, actor);

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token_abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ value: "a@b.com", reason: "UNSUBSCRIBE" });
  });

  it("encodes multipart input as a file part, not JSON", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ storageKey: "k" }));
    vi.stubGlobal("fetch", fetchSpy);

    const descriptor: RouteToolDescriptor = {
      name: "preview_lead_import",
      description: "test",
      method: "POST",
      pathTemplate: "/api/organisations/{organisationId}/leads/import/preview",
      requiredScope: "leads:manage",
      encode: "multipart",
      inputShape: {},
    };

    await buildToolHandler(descriptor)(
      { fileName: "leads.csv", fileContentBase64: Buffer.from("a,b\n1,2").toString("base64") },
      actor,
    );

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("maps a 4xx upstream failure to a non-retryable ToolRequestError with field detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "Invalid request", details: { fieldErrors: { value: ["Required"] } } },
            { status: 400 },
          ),
        ),
    );

    const descriptor: RouteToolDescriptor = {
      name: "add_suppression",
      description: "test",
      method: "POST",
      pathTemplate: "/api/organisations/{organisationId}/suppressions",
      requiredScope: "leads:manage",
      inputShape: {},
    };

    const error = await buildToolHandler(descriptor)({}, actor).catch(
      (e: unknown) => e as ToolRequestError,
    );
    expect(error).toBeInstanceOf(ToolRequestError);
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(400);
    expect(error.message).toContain("Invalid request");
    expect(error.message).toContain("value");
  });

  it("does not append canned guidance that contradicts a specific upstream message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "That user is not a member of this organisation" },
            { status: 403 },
          ),
        ),
    );

    const descriptor: RouteToolDescriptor = {
      name: "remove_member",
      description: "test",
      method: "DELETE",
      pathTemplate: "/api/organisations/{organisationId}/members/{userId}",
      requiredScope: "members:manage",
      inputShape: {},
    };

    const actorWithScope = { ...actor, scope: "profile members:manage" };
    const error = await buildToolHandler(descriptor)({ userId: "nope" }, actorWithScope).catch(
      (e: unknown) => e as ToolRequestError,
    );

    expect(error.message).toContain("That user is not a member of this organisation");
    // The real fix is a different userId, not re-authenticating — so the
    // generic permission/organisation guidance must not be tacked on.
    expect(error.message).not.toContain("lacks the permission");
  });

  it("does append guidance when the upstream gave no specific message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));

    const descriptor: RouteToolDescriptor = {
      name: "get_lead",
      description: "test",
      method: "GET",
      pathTemplate: "/api/organisations/{organisationId}/leads/{leadId}",
      requiredScope: "profile",
      inputShape: {},
    };

    const error = await buildToolHandler(descriptor)({ leadId: "nope" }, actor).catch(
      (e: unknown) => e as ToolRequestError,
    );

    expect(error.message).toContain("Check the id");
  });

  it("maps a 5xx upstream failure to a retryable ToolRequestError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, { status: 503 })),
    );

    const descriptor: RouteToolDescriptor = {
      name: "list_leads",
      description: "test",
      method: "GET",
      pathTemplate: "/api/organisations/{organisationId}/leads",
      requiredScope: "profile",
      inputShape: {},
    };

    const error = await buildToolHandler(descriptor)({}, actor).catch(
      (e: unknown) => e as ToolRequestError,
    );
    expect(error).toBeInstanceOf(ToolRequestError);
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(503);
  });

  it("maps a transport-level failure (fetch throws) to a retryable ToolRequestError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const descriptor: RouteToolDescriptor = {
      name: "list_leads",
      description: "test",
      method: "GET",
      pathTemplate: "/api/organisations/{organisationId}/leads",
      requiredScope: "profile",
      inputShape: {},
    };

    const error = await buildToolHandler(descriptor)({}, actor).catch(
      (e: unknown) => e as ToolRequestError,
    );
    expect(error).toBeInstanceOf(ToolRequestError);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain("ECONNREFUSED");
  });
});
