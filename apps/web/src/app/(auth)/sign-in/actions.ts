"use server";

import { AuthError } from "next-auth";
import { EmailNotVerifiedError } from "@mail-orbyt/authentication";
import { signIn } from "@/lib/auth";

export async function signInAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/overview",
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

export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/overview" });
}
