import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./dns", () => ({
  checkCname: vi.fn(),
  checkVerificationTxt: vi.fn(),
}));

const { checkCname, checkVerificationTxt } = await import("./dns");
const { upsertTrackingDomain, verifyTrackingDomain, getVerifiedTrackingDomain, isApprovedForTls } =
  await import("./domain-service");

function fakePrisma(record: Record<string, unknown> | null = null) {
  return {
    trackingDomain: {
      findUnique: vi.fn().mockResolvedValue(record),
      upsert: vi.fn().mockImplementation(({ create, update }) => ({ ...create, ...update })),
      update: vi.fn().mockImplementation(({ data }) => ({ ...record, ...data })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertTrackingDomain", () => {
  it("normalizes case, whitespace, and a trailing dot", async () => {
    const prisma = fakePrisma();
    await upsertTrackingDomain(prisma as never, "org1", "  Track.ACME.example.  ");

    const call = prisma.trackingDomain.upsert.mock.calls[0][0];
    expect(call.create.domain).toBe("track.acme.example");
    expect(call.update.domain).toBe("track.acme.example");
  });

  it("always resets status to PENDING and clears verifiedAt on update", async () => {
    const prisma = fakePrisma();
    await upsertTrackingDomain(prisma as never, "org1", "track.acme.example");

    const call = prisma.trackingDomain.upsert.mock.calls[0][0];
    expect(call.create.status).toBe("PENDING");
    expect(call.update.status).toBe("PENDING");
    expect(call.update.verifiedAt).toBeNull();
  });

  it("generates a fresh verification token on every call, including re-upserts of the same domain", async () => {
    const prisma = fakePrisma();
    await upsertTrackingDomain(prisma as never, "org1", "track.acme.example");
    await upsertTrackingDomain(prisma as never, "org1", "track.acme.example");

    const first = prisma.trackingDomain.upsert.mock.calls[0][0].create.verificationToken;
    const second = prisma.trackingDomain.upsert.mock.calls[1][0].create.verificationToken;
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keys the upsert by organisationId, not domain", async () => {
    const prisma = fakePrisma();
    await upsertTrackingDomain(prisma as never, "org1", "track.acme.example");
    expect(prisma.trackingDomain.upsert.mock.calls[0][0].where).toEqual({ organisationId: "org1" });
  });
});

describe("verifyTrackingDomain", () => {
  it("returns null when the organisation has no tracking domain set", async () => {
    const prisma = fakePrisma(null);
    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result).toBeNull();
    expect(prisma.trackingDomain.update).not.toHaveBeenCalled();
  });

  it("marks VERIFIED and stamps verifiedAt when both CNAME and TXT pass", async () => {
    vi.mocked(checkCname).mockResolvedValue("PASS");
    vi.mocked(checkVerificationTxt).mockResolvedValue("PASS");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: null,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");

    expect(result?.status).toBe("VERIFIED");
    expect(result?.verifiedAt).toBeInstanceOf(Date);
  });

  it("marks FAILED when only the CNAME passes but the TXT record is missing", async () => {
    vi.mocked(checkCname).mockResolvedValue("PASS");
    vi.mocked(checkVerificationTxt).mockResolvedValue("MISSING");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: null,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result?.status).toBe("FAILED");
  });

  it("marks FAILED when only the TXT passes but the CNAME points elsewhere", async () => {
    vi.mocked(checkCname).mockResolvedValue("FAIL");
    vi.mocked(checkVerificationTxt).mockResolvedValue("PASS");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: null,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result?.status).toBe("FAILED");
  });

  it("preserves the original verifiedAt on a later re-verification instead of bumping it", async () => {
    vi.mocked(checkCname).mockResolvedValue("PASS");
    vi.mocked(checkVerificationTxt).mockResolvedValue("PASS");
    const originalVerifiedAt = new Date("2026-01-01T00:00:00Z");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: originalVerifiedAt,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result?.verifiedAt).toBe(originalVerifiedAt);
  });

  it("clears verifiedAt back to whatever it already was (null) when a previously-unverified domain fails again", async () => {
    vi.mocked(checkCname).mockResolvedValue("FAIL");
    vi.mocked(checkVerificationTxt).mockResolvedValue("MISSING");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: null,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result?.status).toBe("FAILED");
    expect(result?.verifiedAt).toBeNull();
  });

  it("does not clear verifiedAt on a previously-verified domain that later fails (stays VERIFIED-since date even though status flips)", async () => {
    vi.mocked(checkCname).mockResolvedValue("FAIL");
    vi.mocked(checkVerificationTxt).mockResolvedValue("PASS");
    const originalVerifiedAt = new Date("2026-01-01T00:00:00Z");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "abc123",
      verifiedAt: originalVerifiedAt,
    });

    const result = await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(result?.status).toBe("FAILED");
    expect(result?.verifiedAt).toBe(originalVerifiedAt);
  });

  it("checks the TXT record against the stored token, not a value derived from the domain", async () => {
    vi.mocked(checkCname).mockResolvedValue("PASS");
    vi.mocked(checkVerificationTxt).mockResolvedValue("PASS");
    const prisma = fakePrisma({
      domain: "track.acme.example",
      verificationToken: "the-stored-token",
      verifiedAt: null,
    });

    await verifyTrackingDomain(prisma as never, "org1", "track.mail-orbyt.app");
    expect(checkVerificationTxt).toHaveBeenCalledWith("track.acme.example", "the-stored-token");
    expect(checkCname).toHaveBeenCalledWith("track.acme.example", "track.mail-orbyt.app");
  });
});

describe("getVerifiedTrackingDomain", () => {
  it("returns null when the organisation has no tracking domain", async () => {
    const prisma = fakePrisma(null);
    expect(await getVerifiedTrackingDomain(prisma as never, "org1")).toBeNull();
  });

  it("returns null for a PENDING domain (fail-open: no pixel embedded until verified)", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "PENDING" });
    expect(await getVerifiedTrackingDomain(prisma as never, "org1")).toBeNull();
  });

  it("returns null for a FAILED domain", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "FAILED" });
    expect(await getVerifiedTrackingDomain(prisma as never, "org1")).toBeNull();
  });

  it("returns the domain string only when VERIFIED", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "VERIFIED" });
    expect(await getVerifiedTrackingDomain(prisma as never, "org1")).toBe("track.acme.example");
  });
});

describe("isApprovedForTls", () => {
  it("returns false for a domain no organisation has registered", async () => {
    const prisma = fakePrisma(null);
    expect(await isApprovedForTls(prisma as never, "unknown.example")).toBe(false);
  });

  it("returns false when the domain is registered but not yet VERIFIED", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "PENDING" });
    expect(await isApprovedForTls(prisma as never, "track.acme.example")).toBe(false);
  });

  it("returns true only for a VERIFIED domain", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "VERIFIED" });
    expect(await isApprovedForTls(prisma as never, "track.acme.example")).toBe(true);
  });

  it("normalizes case and a trailing dot before looking up, so a proxy-supplied variant still matches", async () => {
    const prisma = fakePrisma({ domain: "track.acme.example", status: "VERIFIED" });
    await isApprovedForTls(prisma as never, "Track.ACME.example.");
    expect(prisma.trackingDomain.findUnique).toHaveBeenCalledWith({
      where: { domain: "track.acme.example" },
    });
  });
});
