import { afterEach, describe, expect, it, vi } from "vitest";

const verifyAccessTokenMock = vi.fn();

vi.mock("@mail-orbyt/database", () => ({ prisma: {} }));
vi.mock("@mail-orbyt/mcp-oauth", () => ({
  verifyAccessToken: verifyAccessTokenMock,
  MAIL_ORBYT_MCP_RESOURCE_URI: "urn:orbyt:mail-orbyt-mcp-server",
}));
vi.mock("./resource-url.js", () => ({
  resourceUrl: () => "https://mcp.mail-orbyt.example",
}));

const { mcpAuthMiddleware } = await import("./auth-middleware");

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeReqRes(authorizationHeader?: string) {
  const req = { headers: { authorization: authorizationHeader } };
  const headers: Record<string, string> = {};
  let statusCode: number | undefined;
  let jsonBody: unknown;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
  };
  return {
    req: req as never as Parameters<ReturnType<typeof mcpAuthMiddleware>>[0],
    res: res as never as Parameters<ReturnType<typeof mcpAuthMiddleware>>[1],
    headers,
    getStatus: () => statusCode,
    getJson: () => jsonBody,
  };
}

const VALID_TOKEN = {
  userId: "user-1",
  organisationId: "org-1",
  scope: "profile leads:manage",
  clientId: "client-1",
};

describe("mcpAuthMiddleware", () => {
  it("rejects a request with no bearer token", async () => {
    const { req, res, getStatus } = fakeReqRes(undefined);
    const next = vi.fn();

    await mcpAuthMiddleware()(req, res, next);

    expect(getStatus()).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(verifyAccessTokenMock).not.toHaveBeenCalled();
  });

  it("rejects when the token itself doesn't verify (unknown/expired/revoked)", async () => {
    verifyAccessTokenMock.mockResolvedValue(null);
    const { req, res, getStatus } = fakeReqRes("Bearer some-token");
    const next = vi.fn();

    await mcpAuthMiddleware()(req, res, next);

    expect(getStatus()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token audienced to the Gateway", async () => {
    verifyAccessTokenMock.mockResolvedValue({
      ...VALID_TOKEN,
      resource: "https://gateway.orbyt.example/mcp",
    });
    const { req, res, getStatus, headers } = fakeReqRes("Bearer some-token");
    const next = vi.fn();

    await mcpAuthMiddleware()(req, res, next);

    expect(getStatus()).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(headers["WWW-Authenticate"]).toContain(
      "https://mcp.mail-orbyt.example/.well-known/oauth-protected-resource",
    );
  });

  it("rejects a token audienced to lead_orbyt", async () => {
    verifyAccessTokenMock.mockResolvedValue({
      ...VALID_TOKEN,
      resource: "urn:orbyt:lead-orbyt-mcp-server",
    });
    const { req, res, getStatus } = fakeReqRes("Bearer some-token");
    const next = vi.fn();

    await mcpAuthMiddleware()(req, res, next);

    expect(getStatus()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a token audienced to mail-orbyt's own resource through", async () => {
    verifyAccessTokenMock.mockResolvedValue({
      ...VALID_TOKEN,
      resource: "urn:orbyt:mail-orbyt-mcp-server",
    });
    const { req, res, getStatus } = fakeReqRes("Bearer some-token");
    const next = vi.fn();

    await mcpAuthMiddleware()(req, res, next);

    expect(getStatus()).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(req.actor).toMatchObject({
      userId: "user-1",
      organisationId: "org-1",
      scope: "profile leads:manage",
      clientId: "client-1",
      resource: "urn:orbyt:mail-orbyt-mcp-server",
      rawToken: "some-token",
    });
  });
});
