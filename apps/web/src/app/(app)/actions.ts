"use server";

import { recordAuditEvent } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { auth, signOut } from "@/lib/auth";

export async function signOutAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) {
    await recordAuditEvent(prisma, { type: "LOGOUT", userId: session.user.id });
  }
  await signOut({ redirectTo: "/sign-in" });
}
