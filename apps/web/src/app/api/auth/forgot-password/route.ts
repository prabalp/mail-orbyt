import { requestPasswordReset } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { emailSchema } from "@mail-orbyt/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailSender } from "@/lib/email";
import { clientIpFrom, rateLimiter } from "@/lib/rate-limit";

const bodySchema = z.object({ email: emailSchema });

const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;
const FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Rate-limited by IP AND by the target email, since either an attacker
  // hammering one victim's inbox or an attacker enumerating many emails
  // from one IP is a real abuse pattern here — both need their own cap.
  const [ipAllowed, emailAllowed] = await Promise.all([
    rateLimiter.attempt(
      `forgot-password-ip:${clientIpFrom(request)}`,
      FORGOT_PASSWORD_MAX_ATTEMPTS,
      FORGOT_PASSWORD_WINDOW_SECONDS,
    ),
    rateLimiter.attempt(
      `forgot-password-email:${parsed.data.email}`,
      FORGOT_PASSWORD_MAX_ATTEMPTS,
      FORGOT_PASSWORD_WINDOW_SECONDS,
    ),
  ]);
  if (!ipAllowed || !emailAllowed) {
    // Same generic response as success — must not reveal that the request
    // was rate-limited rather than merely accepted, or that leaks whether
    // the rate limit key (the email) has been targeted before.
    return NextResponse.json({ status: "ok" });
  }

  const env = loadEnv();
  await requestPasswordReset(prisma, emailSender, {
    email: parsed.data.email,
    appUrl: env.APP_URL,
  });

  // Always the same response, whether or not the email is registered.
  return NextResponse.json({ status: "ok" });
}
