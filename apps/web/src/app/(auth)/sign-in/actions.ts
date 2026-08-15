"use server";

import { AuthError } from "next-auth";
import { EmailNotVerifiedError } from "@mail-orbyt/authentication";
import { signIn } from "@/lib/auth";

/** Only ever redirects to a same-origin path — a client-supplied callbackUrl is never trusted as an absolute/external URL, which would otherwise be an open redirect. */
function safeRedirectTarget(callbackUrl: FormDataEntryValue | null): string {
  if (typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/overview";
}

export async function signInAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeRedirectTarget(formData.get("callbackUrl")),
    });
    return undefined;
  } catch (error) {
    if (error instanceof EmailNotVerifiedError) {
      return "Please verify your email address before signing in — check your inbox for the verification link we sent when you signed up.";
    }
    if (error instanceof AuthError) {
      return "Incorrect email or password.";
    }
    // NextAuth's redirect-on-success mechanism works by throwing a special
    // Next.js redirect error — it must be rethrown, not swallowed here.
    throw error;
  }
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeRedirectTarget(formData.get("callbackUrl")) });
}
