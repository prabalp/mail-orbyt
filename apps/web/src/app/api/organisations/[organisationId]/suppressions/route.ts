import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import {
  addSuppressionEntry,
  checkSuppression,
  listSuppressionEntries,
  removeSuppressionEntry,
} from "@mail-orbyt/leads";
import { paginationSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

/**
 * The do-not-contact list, which until now had a service layer
 * (packages/leads/src/suppression.ts) and no HTTP surface at all — every
 * send path consults it, but nobody could see or edit it. Reads are
 * membership-only; writes require `leads:manage`, since adding an entry
 * silently stops mail to that address.
 */
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

  // `?email=` turns this into a single-address check ("can I mail this
  // person?") rather than a listing — the question a send-time caller
  // actually has, answered with the entry that matched.
  const email = url.searchParams.get("email");
  if (email) {
    const result = await checkSuppression(prisma, organisationId, email);
    return NextResponse.json(result);
  }

  const pagination = paginationSchema.parse(Object.fromEntries(url.searchParams));
  const typeParam = url.searchParams.get("type");
  const type = typeParam === "EMAIL" || typeParam === "DOMAIN" ? typeParam : undefined;

  const result = await listSuppressionEntries(prisma, {
    organisationId,
    ...pagination,
    search: url.searchParams.get("search") ?? undefined,
    type,
  });

  return NextResponse.json(result);
}

const createSchema = z.object({
  type: z.enum(["EMAIL", "DOMAIN"]).default("EMAIL"),
  value: z.string().trim().min(1).max(320),
  reason: z.enum([
    "HARD_BOUNCE",
    "UNSUBSCRIBE",
    "MANUAL_DO_NOT_CONTACT",
    "INVALID_EMAIL",
    "CUSTOMER",
    "ACTIVE_OPPORTUNITY",
  ]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await addSuppressionEntry(prisma, {
    organisationId,
    ...parsed.data,
    createdByUserId: userId,
  });

  return NextResponse.json({ status: "ok" }, { status: 201 });
}

const deleteSchema = z.object({
  type: z.enum(["EMAIL", "DOMAIN"]).default("EMAIL"),
  value: z.string().trim().min(1).max(320),
});

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
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
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const removed = await removeSuppressionEntry(prisma, {
    organisationId,
    ...parsed.data,
    actingUserId: userId,
  });

  if (!removed) {
    return NextResponse.json({ error: "No such suppression entry" }, { status: 404 });
  }

  return NextResponse.json({ status: "ok" });
}
