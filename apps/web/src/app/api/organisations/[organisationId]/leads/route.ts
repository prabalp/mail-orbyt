import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { archiveLeads, listLeads, unarchiveLeads } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { paginationSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
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

  const url = new URL(request.url);
  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const search = url.searchParams.get("search") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "ARCHIVED" ? "ARCHIVED" : statusParam === "ACTIVE" ? "ACTIVE" : undefined;

  const result = await listLeads(prisma, { organisationId, ...pagination, search, status });
  return NextResponse.json(result);
}

const bulkActionSchema = z.object({
  action: z.enum(["archive", "unarchive"]),
  leadIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { organisationId } = await params;

  try {
    await requireOrganisationMembership(prisma, {
      userId: session.user.id,
      organisationId,
      permission: "leads:manage",
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = bulkActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const count =
    parsed.data.action === "archive"
      ? await archiveLeads(prisma, organisationId, parsed.data.leadIds)
      : await unarchiveLeads(prisma, organisationId, parsed.data.leadIds);

  return NextResponse.json({ updated: count });
}
