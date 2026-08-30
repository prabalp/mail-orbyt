import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  resolveCname: vi.fn(),
  resolveTxt: vi.fn(),
}));

const { resolveCname, resolveTxt } = await import("node:dns/promises");
const { checkCname, checkVerificationTxt } = await import("./dns");

describe("checkCname", () => {
  it("passes when the CNAME matches the expected target", async () => {
    vi.mocked(resolveCname).mockResolvedValue(["track.mail-orbyt.app"]);
    const result = await checkCname("track.acme.example", "track.mail-orbyt.app");
    expect(result).toBe("PASS");
  });

  it("fails when the CNAME points somewhere else", async () => {
    vi.mocked(resolveCname).mockResolvedValue(["somewhere-else.example"]);
    const result = await checkCname("track.acme.example", "track.mail-orbyt.app");
    expect(result).toBe("FAIL");
  });

  it("reports MISSING when there's no CNAME record", async () => {
    vi.mocked(resolveCname).mockRejectedValue(new Error("ENOTFOUND"));
    const result = await checkCname("track.acme.example", "track.mail-orbyt.app");
    expect(result).toBe("MISSING");
  });
});

describe("checkVerificationTxt", () => {
  it("passes when the TXT record contains the exact token", async () => {
    vi.mocked(resolveTxt).mockImplementation(async (hostname) => {
      if (hostname === "_mail-orbyt-verify.track.acme.example") return [["abc123"]];
      return [];
    });
    const result = await checkVerificationTxt("track.acme.example", "abc123");
    expect(result).toBe("PASS");
  });

  it("fails when the token doesn't match", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([["wrong-token"]]);
    const result = await checkVerificationTxt("track.acme.example", "abc123");
    expect(result).toBe("FAIL");
  });

  it("reports MISSING when there's no TXT record", async () => {
    vi.mocked(resolveTxt).mockResolvedValue([]);
    const result = await checkVerificationTxt("track.acme.example", "abc123");
    expect(result).toBe("MISSING");
  });
});
