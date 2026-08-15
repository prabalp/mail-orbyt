import { prisma } from "@mail-orbyt/database";
import { listActiveConnections, revokeConnection } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, { organisationId }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const connections = (await listActiveConnections(prisma, { userId })).filter(
    (connection) => connection.organisationId === organisationId,
  );

  return NextResponse.json({ connections });
}

const revokeSchema = z.object({ clientId: z.string().min(1) });

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  let userId: string;
  try {
    ({ userId } = await authenticateOrganisationRequest(request, { organisationId }));
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = revokeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await revokeConnection(prisma, { userId, clientId: parsed.data.clientId, organisationId });

  return NextResponse.json({ status: "ok" });
}
