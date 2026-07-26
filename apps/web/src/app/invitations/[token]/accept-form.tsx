"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@mail-orbyt/design-system";

export function AcceptInvitationForm({ token }: { token: string }): React.ReactElement {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAccept() {
    setStatus("pending");
    const response = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
    if (response.ok) {
      router.push("/overview");
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setErrorMessage(body?.error ?? "Something went wrong.");
    setStatus("error");
  }

  return (
    <>
      {status === "error" ? (
        <div className="mb-4">
          <Alert tone="error" title="Couldn't accept invitation">
            {errorMessage}
          </Alert>
        </div>
      ) : null}
      <Button className="w-full" loading={status === "pending"} onClick={handleAccept}>
        Accept invitation
      </Button>
    </>
  );
}
