import { describe, expect, it, vi } from "vitest";
import { confirmFact, editFact, rejectFact } from "./facts-service";

function fakePrisma(fact: unknown) {
  return {
    researchFact: {
      findUnique: vi.fn().mockResolvedValue(fact),
      update: vi.fn().mockImplementation(({ data }) => ({ ...(fact as object), ...data })),
    },
  };
}

describe("confirmFact", () => {
  it("marks an owned fact USER_CONFIRMED", async () => {
    const prisma = fakePrisma({ id: "f1", organisationId: "org-1", status: "OBSERVED" });
    const result = await confirmFact(prisma, "org-1", "f1");
    expect(result?.status).toBe("USER_CONFIRMED");
  });

  it("returns null (does not update) when the fact belongs to a different organisation", async () => {
    const prisma = fakePrisma({ id: "f1", organisationId: "org-attacker", status: "OBSERVED" });
    const result = await confirmFact(prisma, "org-victim", "f1");
    expect(result).toBeNull();
    expect(prisma.researchFact.update).not.toHaveBeenCalled();
  });

  it("returns null when the fact does not exist", async () => {
    const prisma = fakePrisma(null);
    expect(await confirmFact(prisma, "org-1", "missing")).toBeNull();
  });
});

describe("rejectFact", () => {
  it("marks an owned fact USER_REJECTED", async () => {
    const prisma = fakePrisma({ id: "f1", organisationId: "org-1", status: "OBSERVED" });
    const result = await rejectFact(prisma, "org-1", "f1");
    expect(result?.status).toBe("USER_REJECTED");
  });
});

describe("editFact", () => {
  it("updates the value and marks the fact CONFLICTED rather than silently overwriting", async () => {
    const prisma = fakePrisma({
      id: "f1",
      organisationId: "org-1",
      status: "USER_CONFIRMED",
      value: "old",
    });
    const result = await editFact(prisma, "org-1", "f1", "new value");
    expect(result?.value).toBe("new value");
    expect(result?.status).toBe("CONFLICTED");
  });

  it("does not edit a fact belonging to a different organisation", async () => {
    const prisma = fakePrisma({ id: "f1", organisationId: "org-attacker", value: "old" });
    const result = await editFact(prisma, "org-victim", "f1", "new value");
    expect(result).toBeNull();
    expect(prisma.researchFact.update).not.toHaveBeenCalled();
  });
});
