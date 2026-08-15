import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import {
  addLeadsToList,
  createOrGetLeadList,
  listLeadIdsMatching,
  listLeadLists,
} from "@mail-orbyt/leads";
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
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const leadLists = await listLeadLists(prisma, organisationId);
  return NextResponse.json({ leadLists });
}

/**
 * Creates a list (or reuses one of the same name) and optionally populates it
 * — either from an explicit set of lead IDs or from a filter, so "save this
 * search as a list" works without the client round-tripping every ID.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  leadIds: z.array(z.string().min(1)).max(50000).optional(),
  filter: z
    .object({
      search: z.string().optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
      leadListId: z.string().min(1).optional(),
    })
    .optional(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "leads:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const leadList = await createOrGetLeadList(
    prisma,
    organisationId,
    parsed.data.name,
    parsed.data.description,
  );

  // Filter-based population resolves IDs server-side and is re-scoped to this
  // organisation, so an explicit leadIds payload can never reach another
  // tenant's leads either — both paths funnel through an org-scoped query.
  let leadIds: string[] = [];
  if (parsed.data.filter) {
    leadIds = await listLeadIdsMatching(prisma, { organisationId, ...parsed.data.filter });
  } else if (parsed.data.leadIds?.length) {
    const owned = await prisma.lead.findMany({
      where: { id: { in: parsed.data.leadIds }, organisationId },
      select: { id: true },
    });
    leadIds = owned.map((lead) => lead.id);
  }

  const added = await addLeadsToList(prisma, leadList.id, leadIds);

  return NextResponse.json({ leadList, added }, { status: 201 });
}
