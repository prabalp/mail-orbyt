import { ForbiddenError, verifyEmail } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({ token: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await verifyEmail(prisma, parsed.data.token);
    return NextResponse.json({ status: "verified" });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
