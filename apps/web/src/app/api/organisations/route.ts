import { createOrganisation } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { nonEmptyString } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

const bodySchema = z.object({ name: nonEmptyString(120) });

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const memberships = await prisma.organisationMembership.findMany({
    where: { userId: session.user.id },
    include: { organisation: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    organisations: memberships.map((m) => ({
      id: m.organisation.id,
      name: m.organisation.name,
      slug: m.organisation.slug,
      role: m.role,
    })),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const organisation = await createOrganisation(prisma, {
    name: parsed.data.name,
    ownerUserId: session.user.id,
  });

  return NextResponse.json(
    { id: organisation.id, name: organisation.name, slug: organisation.slug },
    { status: 201 },
  );
}
