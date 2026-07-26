"use client";

import { useState } from "react";
import { Alert, Button, Card, TextInput } from "@mail-orbyt/design-system";

export default function SignUpPage(): React.ReactElement {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card>
        <h1 className="text-2xl font-semibold text-on-surface">Check your email</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          We sent a verification link to <strong>{email}</strong>. Click it to activate your
          account, then sign in.
        </p>
        <a href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Create your account</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        Start running AI-assisted outbound campaigns.
      </p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Couldn't create your account">
            {error}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextInput
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <TextInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          helperText="At least 12 characters, with an uppercase letter, lowercase letter, and a number."
          required
        />
        <Button type="submit" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-on-surface-variant">
        Already have an account?{" "}
        <a href="/sign-in" className="text-primary hover:underline">
          Sign in
        </a>
      </p>
    </Card>
  );
}
