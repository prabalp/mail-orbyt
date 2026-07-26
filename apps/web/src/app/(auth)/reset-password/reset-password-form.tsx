"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, TextInput } from "@mail-orbyt/design-system";

export function ResetPasswordForm(): React.ReactElement {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <Alert tone="error" title="Missing reset token">
          This link is missing its reset token.
        </Alert>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <Alert tone="success" title="Password updated">
          Your password has been changed. All previous sessions have been signed out.
        </Alert>
        <a href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Sign in
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Choose a new password</h1>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Couldn't reset your password">
            {error}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextInput
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          helperText="At least 12 characters, with an uppercase letter, lowercase letter, and a number."
          required
        />
        <Button type="submit" loading={submitting} className="w-full">
          Reset password
        </Button>
      </form>
    </Card>
  );
}
