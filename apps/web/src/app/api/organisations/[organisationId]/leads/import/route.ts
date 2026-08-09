import { ForbiddenError, requireOrganisationMembership } from "@mail-orbyt/authentication";
import { CANONICAL_COLUMNS, createOrGetLeadList, enqueueImportJob } from "@mail-orbyt/leads";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { redisConnection } from "@/lib/queue";

const columnMappingSchema = z.object(
  Object.fromEntries(CANONICAL_COLUMNS.map((column) => [column, z.string().nullable()])) as Record<
    (typeof CANONICAL_COLUMNS)[number],
    z.ZodNullable<z.ZodString>
  >,
);

const bodySchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  columnMapping: columnMappingSchema,
  duplicateStrategy: z.enum(["SKIP", "UPDATE_BLANKS", "OVERWRITE", "REJECT", "ALLOW_SEPARATE"]),
  // Naming the imported audience is mandatory: it's what makes the batch
  // selectable as a unit when enrolling a campaign, instead of ticking
  // prospects one by one. An existing list of the same name is reused.
  leadListName: z.string().trim().min(1).max(120),
  leadListDescription: z.string().trim().max(500).optional(),
});

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

  const batches = await prisma.importBatch.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ batches });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const leadList = await createOrGetLeadList(
    prisma,
    organisationId,
    parsed.data.leadListName,
    parsed.data.leadListDescription,
  );

  const batch = await prisma.importBatch.create({
    data: {
      organisationId,
      createdByUserId: session.user.id,
      leadListId: leadList.id,
      fileName: parsed.data.fileName,
      storageKey: parsed.data.storageKey,
      columnMapping: parsed.data.columnMapping,
      duplicateStrategy: parsed.data.duplicateStrategy,
    },
  });

  await enqueueImportJob(redisConnection, { importBatchId: batch.id });

  return NextResponse.json(
    {
      id: batch.id,
      status: batch.status,
      leadList: { id: leadList.id, name: leadList.name },
    },
    { status: 201 },
  );
}
