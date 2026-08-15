import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { recheckDomainDns } from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

const recheckSchema = z.object({
  domain: z.string().min(1),
  dkimSelector: z.string().min(1).optional(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
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

  const body = recheckSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const result = await recheckDomainDns(organisationId, body.data.domain, body.data.dkimSelector);
  return NextResponse.json(result);
}
