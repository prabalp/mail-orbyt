"use client";

import { useState } from "react";
import { Alert, Button } from "@mail-orbyt/design-system";

/**
 * Verification is a deliberate button click, not automatic on page load —
 * email clients and security scanners commonly pre-fetch links in emails,
 * which would silently burn a one-time verification token before the user
 * ever sees the page if we verified on GET.
 */
export function VerifyEmailForm({ token }: { token: string }): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus("pending");
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      setStatus("success");
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setErrorMessage(body?.error ?? "Something went wrong.");
    setStatus("error");
  }

  if (status === "success") {
    return (
      <>
        <Alert tone="success" title="Email verified">
          Your email address has been confirmed. You can now sign in.
        </Alert>
        <a href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Sign in
        </a>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <Alert tone="error" title="Verification failed">
          {errorMessage}
        </Alert>
        <a href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </a>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-on-surface-variant">Click below to confirm your email address.</p>
      <Button className="mt-4 w-full" loading={status === "pending"} onClick={handleConfirm}>
        Confirm my email
      </Button>
    </>
  );
}
