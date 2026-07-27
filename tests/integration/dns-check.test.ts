import { checkDomainDns } from "@mail-orbyt/gmail";
import { describe, expect, it } from "vitest";

/**
 * Runs against real DNS resolution (not mocked) for a domain with
 * well-known, stable published records — google.com publishes a real SPF
 * record and a `_dmarc.google.com` TXT with p=reject. This exists because
 * dns-check.test.ts (unit, mocked node:dns/promises) proves the parsing
 * logic, but only a live lookup proves the TXT-record-shape assumptions
 * (multi-chunk TXT strings, exact prefix casing, etc.) hold against a real
 * nameserver response.
 */
describe("checkDomainDns (end to end against real DNS)", () => {
  it("reports PASS for both SPF and DMARC on google.com", async () => {
    const result = await checkDomainDns("google.com", undefined);
    expect(result.spf.status).toBe("PASS");
    expect(result.spf.record).toContain("v=spf1");
    expect(result.dmarc.status).toBe("PASS");
    expect(result.dmarc.record?.toLowerCase()).toContain("v=dmarc1");
  }, 15000);

  it("reports MISSING for both on a domain with no mail-related DNS records", async () => {
    const result = await checkDomainDns("no-such-subdomain-for-testing.example.com", undefined);
    expect(result.spf.status).toBe("MISSING");
    expect(result.dmarc.status).toBe("MISSING");
  }, 15000);

  it("reports DKIM as UNKNOWN without a selector, even for a domain with real records", async () => {
    const result = await checkDomainDns("google.com", undefined);
    expect(result.dkim.status).toBe("UNKNOWN");
  }, 15000);
});
