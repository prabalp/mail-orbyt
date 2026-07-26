import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
    /** Set to "PasswordChanged" when the JWT callback detects the token predates a password reset. */
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    passwordChangedAt?: number | null;
    error?: string;
  }
}
