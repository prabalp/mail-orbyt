import { prisma } from "@mail-orbyt/database";
import {
  createPersonalToken,
  listPersonalTokens,
  PERSONAL_TOKEN_EXPIRY_DAYS,
} from "@mail-orbyt/mcp-oauth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mcpServerPublicUrl } from "@/lib/mcp-resource";
import { requireSessionMember } from "@/lib/session-member";

interface RouteParams {
  params: Promise<{ organisationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  const actor = await requireSessionMember(request, organisationId);
  if (actor instanceof NextResponse) return actor;

  const tokens = await listPersonalTokens(prisma, { userId: actor.userId, organisationId });
  return NextResponse.json({ tokens });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z
    .number()
    .int()
    .refine((days) => (PERSONAL_TOKEN_EXPIRY_DAYS as readonly number[]).includes(days))
    .nullable(),
});

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { organisationId } = await params;
  const actor = await requireSessionMember(request, organisationId);
  if (actor instanceof NextResponse) return actor;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const created = await createPersonalToken(prisma, {
    userId: actor.userId,
    organisationId,
    role: actor.membership.role,
    name: parsed.data.name,
    expiresInDays: parsed.data.expiresInDays as 30 | 90 | 365 | null,
  });

  return NextResponse.json(
    {
      token: created.rawToken,
      mcpUrl: `${mcpServerPublicUrl().replace(/\/$/, "")}/mcp`,
      personalToken: created.token,
    },
    { status: 201 },
  );
}
