"use client";

import { useState } from "react";
// Subpath, not the package barrel: the barrel reaches node:crypto, which a
// client bundle can't resolve.
import { AI_MODEL_CHOICES } from "@mail-orbyt/ai-settings/models";
import { Alert, Button, Card, Select, TextInput, useToast } from "@mail-orbyt/design-system";

const CUSTOM_MODEL = "__custom__";

export interface AiProviderClientProps {
  organisationId: string;
  canManage: boolean;
  apiKeyHint: string | null;
  keyDecryptionFailed: boolean;
  model: string | null;
  environmentKeyAvailable: boolean;
  environmentModel: string;
}

export function AiProviderClient({
  organisationId,
  canManage,
  apiKeyHint,
  keyDecryptionFailed,
  model,
  environmentKeyAvailable,
  environmentModel,
}: AiProviderClientProps): React.ReactElement {
  const toast = useToast();
  const [savedHint, setSavedHint] = useState(apiKeyHint);
  // Empty means "leave the saved key alone" — the key is never sent back to
  // the browser, so there is nothing to pre-fill this with.
  const [apiKey, setApiKey] = useState("");
  const isKnownModel = model !== null && AI_MODEL_CHOICES.some((c) => c.value === model);
  const [modelChoice, setModelChoice] = useState(
    model === null ? "" : isKnownModel ? model : CUSTOM_MODEL,
  );
  const [customModel, setCustomModel] = useState(isKnownModel || model === null ? "" : model);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel = modelChoice === CUSTOM_MODEL ? customModel.trim() : modelChoice;

  async function handleSave(clearKey = false) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/settings/ai-provider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Omitting apiKey keeps the stored one; "" clears it.
          ...(clearKey ? { apiKey: "" } : apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          model: effectiveModel,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        apiKeyHint?: string | null;
      } | null;

      if (response.ok) {
        setSavedHint(body?.apiKeyHint ?? null);
        setApiKey("");
        toast.show(
          clearKey ? "Now using the default key" : "AI provider settings saved",
          "success",
        );
      } else {
        setError(body?.error ?? "Couldn't save settings.");
      }
    } finally {
      setSaving(false);
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

        {keyDecryptionFailed ? (
          <Alert tone="error" title="Saved key can't be read">
            The stored key could not be decrypted — this happens if TOKEN_ENCRYPTION_KEY changed
            since it was saved. Emails are being generated with the default key until you enter it
            again.
          </Alert>
        ) : null}

        {!savedHint && !environmentKeyAvailable ? (
          <Alert tone="warning" title="No AI provider configured">
            This deployment has no default key, so AI generation is unavailable until you add one
            here.
          </Alert>
        ) : null}

        <div>
          <h3 className="text-sm font-medium text-on-surface">Gemini API key</h3>
          <p className="text-xs text-on-surface-variant">
            Used for every AI call this organisation makes — drafting emails, the QA review pass
            that runs after each draft, and AI keyword extraction during research. Stored encrypted
            and never shown again after saving. Leave this empty to keep using the deployment&apos;s
            default key.{" "}
            {savedHint
              ? `Currently using your own key (${savedHint}).`
              : environmentKeyAvailable
                ? "Currently using the deployment's default key."
                : ""}
          </p>
        </div>

        <TextInput
          label="API key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={!canManage}
          placeholder={savedHint ? "Enter a new key to replace the saved one" : "AIza…"}
          helperText="Get one from Google AI Studio. Note that each generated email costs two requests — one to draft, one to QA review."
        />

        <Select
          label="Model"
          value={modelChoice}
          onChange={(e) => setModelChoice(e.target.value)}
          disabled={!canManage}
          helperText={`Leave as the default to use this deployment's setting (${environmentModel}).`}
          options={[
            { value: "", label: `Default (${environmentModel})` },
            ...AI_MODEL_CHOICES.map((choice) => ({ value: choice.value, label: choice.label })),
            { value: CUSTOM_MODEL, label: "Custom…" },
          ]}
        />

        {modelChoice === CUSTOM_MODEL ? (
          <TextInput
            label="Custom model ID"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            disabled={!canManage}
            placeholder="gemini-…"
            helperText="Any model ID your key has access to. It's checked against the provider when you save."
          />
        ) : null}

        {canManage ? (
          <div className="flex gap-2">
            <Button onClick={() => handleSave()} loading={saving}>
              Save and test
            </Button>
            {savedHint ? (
              <Button variant="outlined" onClick={() => handleSave(true)} disabled={saving}>
                Remove key
              </Button>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-on-surface-variant">
          Saving makes one small live request to check the key and model actually work, so a bad key
          or an unavailable model is caught here rather than in the middle of a campaign.
        </p>
      </div>
    </Card>
  );
}
