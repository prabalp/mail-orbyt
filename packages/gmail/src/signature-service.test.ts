import { describe, expect, it, vi } from "vitest";
import {
  createSignature,
  deleteSignature,
  listSignatures,
  resolveDefaultSignatureText,
  setDefaultSignature,
  updateSignature,
} from "./signature-service";

function fakePrisma(inbox: unknown, signatures: Record<string, unknown>[] = []) {
  const store = [...signatures];
  const prisma = {
    inbox: { findUnique: vi.fn().mockResolvedValue(inbox) },
    signature: {
      count: vi.fn().mockImplementation(() => store.length),
      findMany: vi.fn().mockImplementation(() => store),
      findUnique: vi.fn().mockImplementation(({ where }) => store.find((s) => s.id === where.id)),
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          store.find((s) => s.inboxId === where.inboxId && s.isDefault === where.isDefault),
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
        for (const s of store) if (s.inboxId === where.inboxId) Object.assign(s, data);
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

const INBOX = { id: "inbox-1", organisationId: "org-1" };

describe("signature-service", () => {
  it("makes the first signature created for an inbox the default automatically", async () => {
    const prisma = fakePrisma(INBOX);
    const signature = await createSignature(prisma, "org-1", "inbox-1", {
      label: "Default",
      content: "Best,\nAlex",
    });
    expect(signature).toMatchObject({ isDefault: true, content: "Best,\nAlex" });
  });

  it("does not make a second signature default unless explicitly requested", async () => {
    const prisma = fakePrisma(INBOX, [
      { id: "sig-1", inboxId: "inbox-1", label: "Default", content: "A", isDefault: true },
    ]);
    const signature = await createSignature(prisma, "org-1", "inbox-1", {
      label: "Formal",
      content: "Regards,\nAlex",
    });
    expect(signature).toMatchObject({ isDefault: false });
  });

  it("setDefaultSignature unsets any other default for the inbox", async () => {
    const prisma = fakePrisma(INBOX, [
      { id: "sig-1", inboxId: "inbox-1", label: "Default", content: "A", isDefault: true },
      { id: "sig-2", inboxId: "inbox-1", label: "Formal", content: "B", isDefault: false },
    ]);
    await setDefaultSignature(prisma, "org-1", "inbox-1", "sig-2");
    const list = await listSignatures(prisma, "org-1", "inbox-1");
    expect(list?.find((s: { id: string }) => s.id === "sig-1")).toMatchObject({ isDefault: false });
    expect(list?.find((s: { id: string }) => s.id === "sig-2")).toMatchObject({ isDefault: true });
  });

  it("resolveDefaultSignatureText returns the default signature's content", async () => {
    const prisma = fakePrisma(INBOX, [
      { id: "sig-1", inboxId: "inbox-1", label: "Default", content: "Best,\nAlex", isDefault: true },
    ]);
    await expect(resolveDefaultSignatureText(prisma, "inbox-1")).resolves.toBe("Best,\nAlex");
  });

  it("resolveDefaultSignatureText returns undefined when no default is set", async () => {
    const prisma = fakePrisma(INBOX, []);
    await expect(resolveDefaultSignatureText(prisma, "inbox-1")).resolves.toBeUndefined();
  });

  it("returns null for operations on an inbox outside the caller's organisation", async () => {
    const prisma = fakePrisma({ id: "inbox-1", organisationId: "other-org" });
    await expect(listSignatures(prisma, "org-1", "inbox-1")).resolves.toBeNull();
    await expect(
      createSignature(prisma, "org-1", "inbox-1", { label: "x", content: "y" }),
    ).resolves.toBeNull();
  });

  it("updateSignature and deleteSignature reject a signature belonging to a different inbox", async () => {
    const prisma = fakePrisma(INBOX, [
      { id: "sig-1", inboxId: "other-inbox", label: "Default", content: "A", isDefault: true },
    ]);
    await expect(
      updateSignature(prisma, "org-1", "inbox-1", "sig-1", { label: "New" }),
    ).resolves.toBeNull();
    await expect(deleteSignature(prisma, "org-1", "inbox-1", "sig-1")).resolves.toBeNull();
  });
});
