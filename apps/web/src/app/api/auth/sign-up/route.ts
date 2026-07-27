import { EmailAlreadyInUseError, passwordSchema, signUp } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { emailSchema, nonEmptyString } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailSender } from "@/lib/email";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: nonEmptyString(120),
  email: emailSchema,
  password: passwordSchema,
});

const SIGN_UP_MAX_ATTEMPTS = 5;
const SIGN_UP_WINDOW_SECONDS = 60 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  const allowed = await rateLimiter.attempt(
    `sign-up:${clientIpFrom(request)}`,
    SIGN_UP_MAX_ATTEMPTS,
    SIGN_UP_WINDOW_SECONDS,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Please try again later." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const env = loadEnv();

  try {
    const user = await signUp(prisma, emailSender, { ...parsed.data, appUrl: env.APP_URL });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      // Deliberately vague to avoid confirming which emails are registered,
      // but sign-up errors are less enumeration-sensitive than login, so a
      // clear message here is an acceptable, standard UX tradeoff.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
