"use client";

import { useState } from "react";
// Subpath, not the package barrel: the barrel reaches node:crypto, which a
// client bundle can't resolve.
import { AI_MODEL_CHOICES } from "@mail-orbyt/ai-settings/models";
import { Alert, Button, Card, Select, TextInput, useToast } from "@mail-orbyt/design-system";

const CUSTOM_MODEL = "__custom__";

type ProviderKind = "GEMINI" | "OPENAI_COMPATIBLE";

export interface AiProviderClientProps {
  organisationId: string;
  canManage: boolean;
  apiKeyHint: string | null;
  keyDecryptionFailed: boolean;
  model: string | null;
  kind: ProviderKind;
  baseUrl: string | null;
  environmentKeyAvailable: boolean;
  environmentModel: string;
}

export function AiProviderClient({
  organisationId,
  canManage,
  apiKeyHint,
  keyDecryptionFailed,
  model,
  kind: initialKind,
  baseUrl: initialBaseUrl,
  environmentKeyAvailable,
  environmentModel,
}: AiProviderClientProps): React.ReactElement {
  const toast = useToast();
  const [savedHint, setSavedHint] = useState(apiKeyHint);
  // Empty means "leave the saved key alone" — the key is never sent back to
  // the browser, so there is nothing to pre-fill this with.
  const [apiKey, setApiKey] = useState("");
  const [kind, setKind] = useState<ProviderKind>(initialKind);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "");
  const isKnownModel = model !== null && AI_MODEL_CHOICES.some((c) => c.value === model);
  const [modelChoice, setModelChoice] = useState(
    model === null ? "" : isKnownModel ? model : CUSTOM_MODEL,
  );
  const [customModel, setCustomModel] = useState(
    kind === "OPENAI_COMPATIBLE" ? (model ?? "") : isKnownModel || model === null ? "" : model,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel =
    kind === "OPENAI_COMPATIBLE"
      ? customModel.trim()
      : modelChoice === CUSTOM_MODEL
        ? customModel.trim()
        : modelChoice;

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
          kind,
          ...(kind === "OPENAI_COMPATIBLE" ? { baseUrl: baseUrl.trim() } : {}),
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
            The stored key could not be decrypted: this happens if TOKEN_ENCRYPTION_KEY changed
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
          <h3 className="text-sm font-medium text-on-surface">AI provider</h3>
          <p className="text-xs text-on-surface-variant">
            Used for every AI call this organisation makes: drafting emails, the QA review pass that
            runs after each draft, and AI keyword extraction during research.
          </p>
        </div>

        <Select
          label="Provider"
          value={kind}
          onChange={(e) => setKind(e.target.value as ProviderKind)}
          disabled={!canManage}
          helperText={
            kind === "OPENAI_COMPATIBLE"
              ? "Any LLM that speaks the OpenAI Chat Completions API: a hosted vendor, a gateway like OpenRouter, or a self-hosted server (vLLM, Ollama, LM Studio, ...)."
              : "Google's Gemini API."
          }
          options={[
            { value: "GEMINI", label: "Gemini (Google AI Studio)" },
            { value: "OPENAI_COMPATIBLE", label: "Custom (OpenAI-compatible API)" },
          ]}
        />

        {kind === "OPENAI_COMPATIBLE" ? (
          <TextInput
            label="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={!canManage}
            placeholder="https://api.your-provider.com/v1"
            helperText="Requests go to {baseUrl}/chat/completions with a Bearer API key, OpenAI's Chat Completions request/response shape."
          />
        ) : null}

        <TextInput
          label="API key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={!canManage}
          placeholder={savedHint ? "Enter a new key to replace the saved one" : "AIza…"}
          helperText={`Stored encrypted and never shown again after saving. Leave this empty to keep using the deployment's default key. ${
            savedHint
              ? `Currently using your own key (${savedHint}).`
              : environmentKeyAvailable
                ? "Currently using the deployment's default key."
                : ""
          }`}
        />

        {kind === "OPENAI_COMPATIBLE" ? (
          <TextInput
            label="Model"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            disabled={!canManage}
            placeholder="e.g. llama-3.1-70b, gpt-4o-mini, claude-3-5-sonnet"
            helperText="Any model ID your endpoint serves. It's checked against the provider when you save."
          />
        ) : (
          <>
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
          </>
        )}

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
