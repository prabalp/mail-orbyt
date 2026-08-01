"use client";

import { useState } from "react";
import { Alert, Button, Card, TextArea, TextInput, useToast } from "@mail-orbyt/design-system";

export interface EmailTemplateClientProps {
  organisationId: string;
  canManage: boolean;
  emailPromptInstructions: string;
  calendlyUrl: string;
}

export function EmailTemplateClient({
  organisationId,
  canManage,
  emailPromptInstructions,
  calendlyUrl,
}: EmailTemplateClientProps): React.ReactElement {
  const toast = useToast();
  const [instructions, setInstructions] = useState(emailPromptInstructions);
  const [link, setLink] = useState(calendlyUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ system: string; user: string } | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/settings/email-template`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailPromptInstructions: instructions, calendlyUrl: link }),
      });
      if (response.ok) {
        toast.show("Email template settings saved", "success");
      } else {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't save settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewPrompt() {
    setLoadingPrompt(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/settings/email-template/prompt-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customInstructions: instructions, calendlyUrl: link }),
        },
      );
      if (response.ok) {
        setPrompt(await response.json());
      } else {
        toast.show("Couldn't build a prompt preview", "error");
      }
    } finally {
      setLoadingPrompt(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="error" title="Couldn't save">
            {error}
          </Alert>
        ) : null}

        <TextArea
          label="Custom tone/style instructions"
          helperText="Appended to the AI's fixed safety rules (never invent facts, no research disclosure, one clear call to action, plain text) — use this for voice, phrasing, or structure preferences only."
          rows={6}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={!canManage}
          placeholder="e.g. Write in a warm, casual tone. Prefer short sentences. Sign off with 'Best,' not 'Regards,'."
        />

        <TextInput
          label="Calendly booking link"
          helperText="Embedded verbatim in every AI-generated email's call to action — never altered or paraphrased by the model."
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={!canManage}
          placeholder="https://calendly.com/your-name/intro-call"
        />

        {canManage ? (
          <div className="flex gap-2">
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
            <Button variant="outlined" onClick={handlePreviewPrompt} loading={loadingPrompt}>
              Preview full prompt
            </Button>
          </div>
        ) : null}

        {prompt ? (
          <div className="flex flex-col gap-3 border-t border-outline/20 pt-4">
            <p className="text-xs text-on-surface-variant">
              This is the exact prompt-building code real drafts use, rendered against sample
              recipient/company data (with your current, possibly-unsaved instructions and link
              above) — not a real lead's data.
            </p>
            <details className="rounded-md-md border border-outline/30 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-on-surface-variant">
                System prompt
              </summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-on-surface">
                {prompt.system}
              </pre>
            </details>
            <details className="rounded-md-md border border-outline/30 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-on-surface-variant">
                User prompt
              </summary>
              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-on-surface">
                {prompt.user}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
