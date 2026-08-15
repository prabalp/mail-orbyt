import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/api-auth";
import { ACTIVE_ORGANISATION_COOKIE } from "@/lib/current-organisation";

const bodySchema = z.object({ organisationId: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  let userId: string;
  try {
    userId = await authenticateUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // The organisationId the client asked to switch to is untrusted input —
  // requireOrganisationMembership re-derives access from the database
  // before we ever write it into the session cookie.
  try {
    await requireOrganisationMembership(prisma, {
      userId,
      organisationId: parsed.data.organisationId,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(ACTIVE_ORGANISATION_COOKIE, parsed.data.organisationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
