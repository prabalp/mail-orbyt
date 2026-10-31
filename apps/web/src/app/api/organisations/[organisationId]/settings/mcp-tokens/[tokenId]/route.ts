import { prisma } from "@mail-orbyt/database";
import { revokePersonalToken } from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { requireSessionMember } from "@/lib/session-member";

interface RouteParams {
  params: Promise<{ organisationId: string; tokenId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId, tokenId } = await params;
  const actor = await requireSessionMember(request, organisationId);
  if (actor instanceof NextResponse) return actor;

  const revoked = await revokePersonalToken(prisma, {
    userId: actor.userId,
    organisationId,
    tokenId,
  });
  if (!revoked) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  return NextResponse.json({ status: "ok" });
}
