import {
  ForbiddenError,
  OrganisationNameMismatchError,
  UnauthenticatedError,
  deleteOrganisation,
} from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, { organisationId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!organisation) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: organisation.id,
    name: organisation.name,
    slug: organisation.slug,
  });
}

const deleteSchema = z.object({
  confirmName: z.string().min(1).describe("Must exactly equal the organisation's current name"),
});

/**
 * Permanently deletes the organisation and everything scoped to it — every
 * lead, campaign, conversation, inbox connection, research fact, all of it.
 * There is no undo. Requires `organisation:delete` (OWNER only) and the
 * caller must type the organisation's exact current name as `confirmName`;
 * the service layer (`deleteOrganisation`) re-checks that itself rather
 * than trusting this route alone.
 */
export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "organisation:delete",
    }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const deleted = await deleteOrganisation(prisma, {
      organisationId,
      confirmName: parsed.data.confirmName,
      deletedByUserId: userId,
    });
    if (!deleted) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
    }
  } catch (error) {
    if (error instanceof OrganisationNameMismatchError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}
