"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, TextInput } from "@mail-orbyt/design-system";

export function OnboardingForm(): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        setError("Couldn't create your organisation. Please try again.");
        return;
      }
      router.push("/overview");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Create your organisation</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        You&apos;ll be its owner and can invite teammates afterward.
      </p>

      {error ? (
        <div className="mt-4">
          <Alert tone="error" title="Something went wrong">
            {error}
          </Alert>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextInput
          label="Organisation name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit" loading={submitting} className="w-full">
          Create organisation
        </Button>
      </form>
    </Card>
  );
}
