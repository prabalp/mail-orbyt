import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const { lookup } = await import("node:dns/promises");
const { assertSafeUrl, UnsafeUrlError } = await import("./ssrf-guard");

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("ftp://example.com/file")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects an unparseable URL", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects literal loopback IPv4", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects the cloud metadata IP", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("rejects RFC1918 private ranges", async () => {
    await expect(assertSafeUrl("http://10.0.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("http://172.16.0.5/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("http://192.168.1.5/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects literal IPv6 loopback and unique-local", async () => {
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("http://[fd00::1]/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects localhost by name without needing DNS", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertSafeUrl("http://foo.localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  it("allows a public IPv4 literal", async () => {
    await expect(assertSafeUrl("http://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });

  it("rejects a hostname that resolves to a private IP (DNS rebinding-style check)", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertSafeUrl("http://attacker-controlled.example.com/")).rejects.toThrow(
      UnsafeUrlError,
    );
  });

  it("allows a hostname that resolves only to public IPs", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeUrl("https://example.com/")).resolves.toBeInstanceOf(URL);
  });

  it("rejects when even one of multiple resolved addresses is private", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(assertSafeUrl("https://multi-homed.example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects when DNS resolution fails", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(assertSafeUrl("https://does-not-exist.invalid/")).rejects.toThrow(UnsafeUrlError);
  });
});
