import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  resolveTxt: vi.fn(),
}));

const { resolveTxt } = await import("node:dns/promises");
const { checkDomainDns } = await import("./dns-check");

describe("checkDomainDns", () => {
  it("passes SPF when a v=spf1 TXT record exists on the domain", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname) => {
      if (hostname === "acme.example") return [["v=spf1 include:_spf.google.com ~all"]];
      return [];
    });
    const result = await checkDomainDns("acme.example", undefined);
    expect(result.spf.status).toBe("PASS");
    expect(result.spf.record).toContain("v=spf1");
  });

  it("reports SPF as MISSING when no v=spf1 record is found", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([]);
    const result = await checkDomainDns("acme.example", undefined);
    expect(result.spf.status).toBe("MISSING");
  });

  it("passes DMARC when a reject/quarantine policy is published under _dmarc", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname) => {
      if (hostname === "_dmarc.acme.example") return [["v=DMARC1; p=reject;"]];
      return [];
    });
    const result = await checkDomainDns("acme.example", undefined);
    expect(result.dmarc.status).toBe("PASS");
  });

  it("fails DMARC when the policy is p=none", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname) => {
      if (hostname === "_dmarc.acme.example") return [["v=DMARC1; p=none;"]];
      return [];
    });
    const result = await checkDomainDns("acme.example", undefined);
    expect(result.dmarc.status).toBe("FAIL");
  });

  it("reports DKIM as UNKNOWN when no selector is provided", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([]);
    const result = await checkDomainDns("acme.example", undefined);
    expect(result.dkim.status).toBe("UNKNOWN");
  });

  it("passes DKIM when the given selector resolves a v=DKIM1 record", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname) => {
      if (hostname === "google._domainkey.acme.example") return [["v=DKIM1; k=rsa; p=abc123"]];
      return [];
    });
    const result = await checkDomainDns("acme.example", "google");
    expect(result.dkim.status).toBe("PASS");
  });

  it("reports MISSING for a DKIM selector that resolves to nothing", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([]);
    const result = await checkDomainDns("acme.example", "google");
    expect(result.dkim.status).toBe("MISSING");
  });

  it("treats a DNS resolution error as an empty record set rather than throwing", async () => {
    vi.mocked(resolveTxt).mockRejectedValue(new Error("ENOTFOUND"));
    const result = await checkDomainDns("does-not-exist.invalid", undefined);
    expect(result.spf.status).toBe("MISSING");
    expect(result.dmarc.status).toBe("MISSING");
  });
});
