"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Select,
  Skeleton,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface EmailDraft {
  id: string;
  generationType: "INITIAL" | "FOLLOW_UP" | "CLOSE_THE_LOOP";
  rewriteStyle: "SHORTER" | "FORMAL" | "DIRECT" | null;
  subject: string;
  body: string;
  status: "DRAFT" | "APPROVED" | "DISCARDED";
  createdAt: string;
}

const STATUS_TONE: Record<EmailDraft["status"], "success" | "neutral" | "error"> = {
  DRAFT: "neutral",
  APPROVED: "success",
  DISCARDED: "error",
};

export function EmailDraftPanel({ leadId }: { leadId: string }): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [callToAction, setCallToAction] = useState("book a 15 minute intro call");

  const apiBase = `/api/organisations/${organisationId}/leads/${leadId}/email-drafts`;

  const load = useCallback(async () => {
    const response = await fetch(apiBase);
    if (response.ok) {
      const data = await response.json();
      setDrafts(data.drafts);
      setAiConfigured(data.aiConfigured);
    }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate(
    generationType: EmailDraft["generationType"],
    basedOnDraftId?: string,
  ) {
    setGenerating(true);
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationType, callToAction, basedOnDraftId }),
      });
      if (response.ok) {
        await load();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.show(data.error ?? "Could not generate email", "error");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleDraftAction(
    draftId: string,
    action: "approve" | "discard" | "rewrite",
    style?: "SHORTER" | "FORMAL" | "DIRECT",
  ) {
    const response = await fetch(`/api/organisations/${organisationId}/email-drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(style ? { action, style } : { action }),
    });
    if (response.ok) {
      await load();
    } else {
      const data = await response.json().catch(() => ({}));
      toast.show(data.error ?? "Something went wrong", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-on-surface-variant">AI email draft</h3>
        <Alert tone="info" title="AI email generation is not configured">
          Set AI_PROVIDER_API_KEY to enable generating draft emails for this lead.
        </Alert>
      </div>
    );
  }

  const latestActiveDraft = drafts.find((draft) => draft.status !== "DISCARDED");

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-medium text-on-surface-variant">AI email draft</h3>

      {drafts.length === 0 ? (
        <>
          <TextInput
            label="Call to action"
            value={callToAction}
            onChange={(event) => setCallToAction(event.target.value)}
          />
          <Button loading={generating} onClick={() => handleGenerate("INITIAL")}>
            Generate initial email
          </Button>
        </>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outlined"
            loading={generating}
            onClick={() => handleGenerate("FOLLOW_UP", latestActiveDraft?.id)}
            disabled={!latestActiveDraft}
          >
            Generate follow-up
          </Button>
          <Button
            variant="outlined"
            loading={generating}
            onClick={() => handleGenerate("CLOSE_THE_LOOP", latestActiveDraft?.id)}
            disabled={!latestActiveDraft}
          >
            Generate close-the-loop
          </Button>
        </div>
      )}

      {drafts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          description="Generate an AI draft from this lead's confirmed research facts."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <li key={draft.id} className="rounded-md-md border border-outline/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">
                    {draft.generationType.replace(/_/g, " ")}
                    {draft.rewriteStyle ? ` — ${draft.rewriteStyle.toLowerCase()} rewrite` : ""}
                  </p>
                  <p className="mt-1 text-sm font-medium text-on-surface">{draft.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-on-surface-variant">
                    {draft.body}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[draft.status]}>{draft.status}</Badge>
              </div>
              {draft.status === "DRAFT" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="text" onClick={() => handleDraftAction(draft.id, "approve")}>
                    Approve
                  </Button>
                  <Button variant="text" onClick={() => handleDraftAction(draft.id, "discard")}>
                    Discard
                  </Button>
                  <Select
                    label="Rewrite"
                    hideLabel
                    placeholder="Rewrite as…"
                    options={[
                      { value: "SHORTER", label: "Shorter" },
                      { value: "FORMAL", label: "Formal" },
                      { value: "DIRECT", label: "Direct" },
                    ]}
                    onChange={(event) => {
                      const style = event.target.value as "SHORTER" | "FORMAL" | "DIRECT" | "";
                      if (style) void handleDraftAction(draft.id, "rewrite", style);
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
