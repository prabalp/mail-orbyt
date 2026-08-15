import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { deleteLeadsData } from "@mail-orbyt/compliance";
import { archiveLeads, listLeadIdsMatching, listLeads, unarchiveLeads } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { paginationSchema } from "@mail-orbyt/validation";
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

  const url = new URL(request.url);
  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const search = url.searchParams.get("search") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "ARCHIVED" ? "ARCHIVED" : statusParam === "ACTIVE" ? "ACTIVE" : undefined;
  const leadListId = url.searchParams.get("leadListId") ?? undefined;

  const result = await listLeads(prisma, {
    organisationId,
    ...pagination,
    search,
    status,
    leadListId,
  });
  return NextResponse.json(result);
}

/** The filter half of the leads query, mirrored from GET so a bulk action can say "everything matching what I'm looking at" instead of enumerating IDs. */
const filterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  leadListId: z.string().min(1).optional(),
});

/**
 * A bulk action targets EITHER an explicit set of IDs (what's ticked on the
 * current page) OR a filter (the table's "select all N matching"). The filter
 * form is resolved to IDs server-side rather than trusting a client-sent list
 * of up to 50k strings, and both forms stay scoped to this organisation.
 */
const bulkActionSchema = z.intersection(
  z.object({ action: z.enum(["archive", "unarchive", "delete"]) }),
  z.union([
    z.object({ leadIds: z.array(z.string().min(1)).min(1).max(50000) }),
    z.object({ filter: filterSchema }),
  ]),
);

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "leads:manage",
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
  const parsed = bulkActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const target = parsed.data;
  const leadIds =
    "leadIds" in target
      ? target.leadIds
      : await listLeadIdsMatching(prisma, { organisationId, ...target.filter });

  if (leadIds.length === 0) {
    return NextResponse.json({ updated: 0, deleted: 0 });
  }

  if (target.action === "delete") {
    // Hard delete: cascades through enrollments, outbox items, conversations,
    // meetings and research for each lead, and is audited as one event.
    const deleted = await deleteLeadsData(prisma, organisationId, leadIds, userId);
    return NextResponse.json({ deleted });
  }

  const count =
    target.action === "archive"
      ? await archiveLeads(prisma, organisationId, leadIds)
      : await unarchiveLeads(prisma, organisationId, leadIds);

  return NextResponse.json({ updated: count });
}
