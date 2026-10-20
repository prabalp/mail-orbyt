"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, Select, TextInput, useToast } from "@mail-orbyt/design-system";

type RoutingMode = "LINEAR" | "JOURNEY";
type ContentSource = "AI" | "TEMPLATE" | "IMPORTED";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function NewCampaignDialog({
  open,
  onClose,
  organisationId,
}: {
  open: boolean;
  onClose: () => void;
  organisationId: string;
}): React.ReactElement {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [routingMode, setRoutingMode] = useState<RoutingMode>("LINEAR");
  const [contentSource, setContentSource] = useState<ContentSource>("AI");
  const [creating, setCreating] = useState(false);

  // Journeys can't use AI-written emails yet, so choosing one moves AI to a
  // written template rather than leaving an invalid combination selected.
  function chooseRouting(mode: RoutingMode) {
    setRoutingMode(mode);
    if (mode === "JOURNEY" && contentSource === "AI") setContentSource("TEMPLATE");
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Schedule and inboxes are set on the campaign page; the timezone is
        // taken from the browser so the default window matches the user's day.
        body: JSON.stringify({
          name: name.trim(),
          routingMode,
          contentSource,
          timezone: browserTimezone(),
        }),
      });
      const campaign = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok || !campaign?.id) {
        toast.show(campaign?.error ?? "Could not create campaign", "error");
        return;
      }
      setName("");
      setRoutingMode("LINEAR");
      setContentSource("AI");
      onClose();
      router.push(`/campaigns/${campaign.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New campaign"
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={creating} disabled={!name.trim()} onClick={handleCreate}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Campaign name"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
        <Select
          label="Sequence type"
          value={routingMode}
          options={[
            { value: "LINEAR", label: "Linear" },
            { value: "JOURNEY", label: "Journey" },
          ]}
          onChange={(event) => chooseRouting(event.target.value as RoutingMode)}
        />
        <Select
          label="Emails"
          value={contentSource}
          options={[
            { value: "AI", label: "AI-written", disabled: routingMode === "JOURNEY" },
            { value: "TEMPLATE", label: "Template" },
            { value: "IMPORTED", label: "Uploaded list" },
          ]}
          onChange={(event) => setContentSource(event.target.value as ContentSource)}
        />
      </div>
    </Dialog>
  );
}
