import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import {
  deleteOrganisationSignature,
  setDefaultOrganisationSignature,
  updateOrganisationSignature,
} from "@/lib/gmail";

interface RouteParams {
  params: Promise<{ organisationId: string; signatureId: string }>;
}

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(2000).optional(),
  isDefault: z.literal(true).optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, signatureId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  if (body.data.isDefault) {
    const signature = await setDefaultOrganisationSignature(organisationId, signatureId);
    if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
    return NextResponse.json(signature);
  }

  const { label, content } = body.data;
  const signature = await updateOrganisationSignature(organisationId, signatureId, {
    label,
    content,
  });
  if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  return NextResponse.json(signature);
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, signatureId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "inboxes:manage",
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const signature = await deleteOrganisationSignature(organisationId, signatureId);
  if (!signature) return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  return NextResponse.json(signature);
}
