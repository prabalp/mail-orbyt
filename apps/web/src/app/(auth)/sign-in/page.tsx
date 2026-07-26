"use client";

import { useActionState } from "react";
import { Alert, Button, Card, TextInput } from "@mail-orbyt/design-system";
import { signInAction, signInWithGoogleAction } from "./actions";

export default function SignInPage(): React.ReactElement {
  const [error, formAction, isPending] = useActionState(signInAction, undefined);

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Sign in</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Welcome back to Mail Orbyt.</p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Sign-in failed">
            {error}
          </Alert>
        </div>
      ) : null}

      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <TextInput label="Email" name="email" type="email" autoComplete="email" required />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" loading={isPending} className="w-full">
          Sign in
        </Button>
      </form>

      <form action={signInWithGoogleAction} className="mt-3">
        <Button type="submit" variant="outlined" className="w-full">
          Continue with Google
        </Button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm text-on-surface-variant">
        <a href="/forgot-password" className="text-primary hover:underline">
          Forgot your password?
        </a>
        <span>
          Don&apos;t have an account?{" "}
          <a href="/sign-up" className="text-primary hover:underline">
            Sign up
          </a>
        </span>
      </div>
    </Card>
  );
}
