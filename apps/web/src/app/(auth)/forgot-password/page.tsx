"use client";

import { useState } from "react";
import { Button, Card, TextInput } from "@mail-orbyt/design-system";

export default function ForgotPasswordPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <Card>
        <h1 className="text-2xl font-semibold text-on-surface">Check your email</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your
          password.
        </p>
        <a href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </a>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Reset your password</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Button type="submit" loading={submitting} className="w-full">
          Send reset link
        </Button>
      </form>
    </Card>
  );
}
