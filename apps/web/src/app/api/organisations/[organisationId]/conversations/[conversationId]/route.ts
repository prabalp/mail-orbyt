import { ForbiddenError, UnauthenticatedError } from "@mail-orbyt/authentication";
import { NextResponse } from "next/server";
import { authenticateOrganisationRequest } from "@/lib/api-auth";
import { getOrganisationConversation } from "@/lib/conversations";

interface RouteParams {
  params: Promise<{ organisationId: string; conversationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, conversationId } = await params;

  try {
    await authenticateOrganisationRequest(request, {
      organisationId,
      permission: "conversations:review",
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

  const conversation = await getOrganisationConversation(organisationId, conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json(conversation);
}
