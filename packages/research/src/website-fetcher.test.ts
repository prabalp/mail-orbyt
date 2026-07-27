import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

// The SSRF guard is unit-tested exhaustively in ssrf-guard.test.ts. These
// tests exercise fetchWebsite's OWN logic (redirect chasing, hop
// re-validation, size limits, error propagation) against a real local HTTP
// server — mocking the guard to a pass-through so localhost isn't rejected,
// which it correctly would be in production.
vi.mock("./ssrf-guard", () => ({
  assertSafeUrl: vi.fn(async (url: string) => new URL(url)),
  UnsafeUrlError: class UnsafeUrlError extends Error {},
}));

const { assertSafeUrl } = await import("./ssrf-guard");
const { fetchWebsite, WebsiteFetchError } = await import("./website-fetcher");

let server: Server;
let baseUrl: string;

function startServer(handler: Parameters<typeof createServer>[0]): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterEach(async () => {
  vi.mocked(assertSafeUrl).mockClear();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchWebsite", () => {
  it("fetches HTML and returns the status and final URL", async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>hello</body></html>");
    });

    const result = await fetchWebsite(baseUrl);
    expect(result.httpStatus).toBe(200);
    expect(result.html).toContain("hello");
    expect(result.finalUrl).toBe(`${baseUrl}/`);
  });

  it("follows a redirect and re-validates the target with the SSRF guard", async () => {
    baseUrl = await startServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { Location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>redirected</body></html>");
    });

    const result = await fetchWebsite(`${baseUrl}/start`);
    expect(result.html).toContain("redirected");
    // Called once for the initial URL and once for the redirect target.
    expect(vi.mocked(assertSafeUrl)).toHaveBeenCalledTimes(2);
  });

  it("throws after exceeding the redirect limit", async () => {
    baseUrl = await startServer((req, res) => {
      const current = Number(req.url?.slice(1) ?? "0");
      res.writeHead(302, { Location: `/${current + 1}` });
      res.end();
    });

    await expect(fetchWebsite(`${baseUrl}/0`)).rejects.toThrow(/redirect/i);
  });

  it("throws when a redirect has no Location header", async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(302);
      res.end();
    });

    await expect(fetchWebsite(baseUrl)).rejects.toThrow(WebsiteFetchError);
  });

  it("enforces the response size limit", async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("x".repeat(3 * 1024 * 1024)); // 3 MB, over the 2 MB limit
    });

    await expect(fetchWebsite(baseUrl)).rejects.toThrow(/byte limit/);
  });

  it("propagates a non-2xx status without throwing (caller decides what to do)", async () => {
    baseUrl = await startServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<html><body>not found</body></html>");
    });

    const result = await fetchWebsite(baseUrl);
    expect(result.httpStatus).toBe(404);
  });
});
