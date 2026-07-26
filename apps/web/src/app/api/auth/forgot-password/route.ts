import { requestPasswordReset } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailSender } from "@/lib/email";

const bodySchema = z.object({ email: emailSchema });

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const env = loadEnv();
  await requestPasswordReset(prisma, emailSender, {
    email: parsed.data.email,
    appUrl: env.APP_URL,
  });

  // Always the same response, whether or not the email is registered.
  return NextResponse.json({ status: "ok" });
}
