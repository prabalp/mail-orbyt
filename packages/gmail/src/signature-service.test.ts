import { describe, expect, it, vi } from "vitest";
import {
  createSignature,
  deleteSignature,
  listSignatures,
  resolveDefaultSignatureText,
  setDefaultSignature,
  updateSignature,
} from "./signature-service";

function fakePrisma(signatures: Record<string, unknown>[] = []) {
  const store = [...signatures];
  const prisma = {
    signature: {
      count: vi.fn().mockImplementation(() => store.length),
      findMany: vi.fn().mockImplementation(() => store),
      findUnique: vi.fn().mockImplementation(({ where }) => store.find((s) => s.id === where.id)),
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          store.find(
            (s) => s.organisationId === where.organisationId && s.isDefault === where.isDefault,
          ),
        ),
      create: vi.fn().mockImplementation(({ data }) => {
        const created = { id: `sig-${store.length + 1}`, ...data };
        store.push(created);
        return created;
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const found = store.find((s) => s.id === where.id)!;
        Object.assign(found, data);
        return found;
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        for (const s of store)
          if (s.organisationId === where.organisationId) Object.assign(s, data);
        return { count: store.length };
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        const index = store.findIndex((s) => s.id === where.id);
        const [removed] = store.splice(index, 1);
        return removed;
      }),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma as unknown as Parameters<typeof createSignature>[0];
}

describe("signature-service", () => {
  it("makes the first signature created for an organisation the default automatically", async () => {
    const prisma = fakePrisma();
    const signature = await createSignature(prisma, "org-1", {
      label: "Default",
      content: "Best,\nAlex",
    });
    expect(signature).toMatchObject({ isDefault: true, content: "Best,\nAlex" });
  });

  it("does not make a second signature default unless explicitly requested", async () => {
    const prisma = fakePrisma([
      { id: "sig-1", organisationId: "org-1", label: "Default", content: "A", isDefault: true },
    ]);
    const signature = await createSignature(prisma, "org-1", {
      label: "Formal",
      content: "Regards,\nAlex",
    });
    expect(signature).toMatchObject({ isDefault: false });
  });

  it("setDefaultSignature unsets any other default for the organisation", async () => {
    const prisma = fakePrisma([
      { id: "sig-1", organisationId: "org-1", label: "Default", content: "A", isDefault: true },
      { id: "sig-2", organisationId: "org-1", label: "Formal", content: "B", isDefault: false },
    ]);
    await setDefaultSignature(prisma, "org-1", "sig-2");
    const list = await listSignatures(prisma, "org-1");
    expect(list.find((s: { id: string }) => s.id === "sig-1")).toMatchObject({ isDefault: false });
    expect(list.find((s: { id: string }) => s.id === "sig-2")).toMatchObject({ isDefault: true });
  });

  it("signatures are shared across every inbox — listSignatures takes no inboxId", async () => {
    const prisma = fakePrisma([
      { id: "sig-1", organisationId: "org-1", label: "Default", content: "A", isDefault: true },
    ]);
    const list = await listSignatures(prisma, "org-1");
    expect(list).toHaveLength(1);
  });

  it("resolveDefaultSignatureText returns the default signature's content", async () => {
    const prisma = fakePrisma([
      {
        id: "sig-1",
        organisationId: "org-1",
        label: "Default",
        content: "Best,\nAlex",
        isDefault: true,
      },
    ]);
    await expect(resolveDefaultSignatureText(prisma, "org-1")).resolves.toBe("Best,\nAlex");
  });

  it("resolveDefaultSignatureText returns undefined when no default is set", async () => {
    const prisma = fakePrisma([]);
    await expect(resolveDefaultSignatureText(prisma, "org-1")).resolves.toBeUndefined();
  });

  it("updateSignature and deleteSignature reject a signature belonging to a different organisation", async () => {
    const prisma = fakePrisma([
      { id: "sig-1", organisationId: "other-org", label: "Default", content: "A", isDefault: true },
    ]);
    await expect(updateSignature(prisma, "org-1", "sig-1", { label: "New" })).resolves.toBeNull();
    await expect(deleteSignature(prisma, "org-1", "sig-1")).resolves.toBeNull();
  });
});
