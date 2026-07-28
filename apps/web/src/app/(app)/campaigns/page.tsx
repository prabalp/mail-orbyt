"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  PageHeader,
  Table,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";
import { Send } from "lucide-react";
import { useOrganisation } from "../organisation-context";

interface Campaign {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  createdAt: string;
}

const STATUS_TONE: Record<Campaign["status"], "neutral" | "success" | "warning" | "error"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "neutral",
  ARCHIVED: "error",
};

export default function CampaignsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/campaigns`);
    if (response.ok) {
      const data = await response.json();
      setCampaigns(data.campaigns);
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setCreating(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setDialogOpen(false);
        setName("");
        await load();
      } else {
        toast.show("Could not create campaign", "error");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaigns"
        description="Build sequences of emails and enroll leads to be contacted."
        actions={<Button onClick={() => setDialogOpen(true)}>New campaign</Button>}
      />

      <Card>
        {loading ? null : campaigns.length === 0 ? (
          <EmptyState
            icon={<Send />}
            title="No campaigns yet"
            description="Create your first campaign to get started."
          />
        ) : (
          <Table
            columns={[
              {
                key: "name",
                header: "Name",
                render: (campaign: Campaign) => (
                  <Link href={`/campaigns/${campaign.id}`} className="text-primary hover:underline">
                    {campaign.name}
                  </Link>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (campaign: Campaign) => (
                  <Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
                ),
              },
            ]}
            rows={campaigns}
            getRowKey={(campaign) => campaign.id}
          />
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New campaign"
        footer={
          <>
            <Button variant="outlined" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button loading={creating} disabled={!name} onClick={handleCreate}>
              Create
            </Button>
          </>
        }
      >
        <TextInput
          label="Campaign name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </div>
  );
}
