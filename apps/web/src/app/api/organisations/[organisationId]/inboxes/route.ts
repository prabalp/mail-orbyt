import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listOrganisationDnsChecks, listOrganisationInboxes } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, { userId: session.user.id, organisationId });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const [inboxes, dnsChecks] = await Promise.all([
    listOrganisationInboxes(organisationId),
    listOrganisationDnsChecks(organisationId),
  ]);

  return NextResponse.json({
    inboxes: inboxes.map((inbox) => ({
      id: inbox.id,
      emailAddress: inbox.emailAddress,
      displayName: inbox.displayName,
      status: inbox.status,
      dailySendLimit: inbox.dailySendLimit,
      createdAt: inbox.createdAt,
    })),
    dnsChecks,
  });
}
