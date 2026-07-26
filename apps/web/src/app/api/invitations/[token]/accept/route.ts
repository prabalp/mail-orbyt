import { acceptInvitation, ForbiddenError } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { token } = await params;

  try {
    await acceptInvitation(prisma, {
      rawToken: token,
      acceptingUserId: session.user.id,
      acceptingUserEmail: session.user.email,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}
