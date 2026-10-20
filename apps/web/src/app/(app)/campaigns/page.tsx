"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  useToast,
} from "@mail-orbyt/design-system";
import { Send } from "lucide-react";
import { useOrganisation } from "../organisation-context";
import { NewCampaignDialog } from "./new-campaign-dialog";

interface Campaign {
  id: string;
  name: string;
  routingMode?: "LINEAR" | "JOURNEY";
  contentSource?: "AI" | "TEMPLATE" | "IMPORTED";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  async function handleDelete(campaign: Campaign) {
    const confirmed = window.confirm(
      `Delete "${campaign.name}"? This stops all sending and removes it from this list.`,
    );
    if (!confirmed) return;

    setDeletingId(campaign.id);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/campaigns/${campaign.id}`,
        {
          method: "DELETE",
        },
      );
      if (response.ok) {
        toast.show("Campaign deleted", "success");
        await load();
      } else {
        toast.show("Could not delete campaign", "error");
      }
    } finally {
      setDeletingId(null);
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
                key: "type",
                header: "Type",
                render: (campaign: Campaign) => (
                  <span className="text-sm text-on-surface-variant">
                    {campaign.routingMode === "JOURNEY" ? "Journey" : "Linear"} ·{" "}
                    {campaign.contentSource === "TEMPLATE"
                      ? "Template"
                      : campaign.contentSource === "IMPORTED"
                        ? "Uploaded list"
                        : "AI"}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (campaign: Campaign) => (
                  <Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (campaign: Campaign) => (
                  <Button
                    variant="text"
                    loading={deletingId === campaign.id}
                    onClick={() => handleDelete(campaign)}
                  >
                    Delete
                  </Button>
                ),
              },
            ]}
            rows={campaigns}
            getRowKey={(campaign) => campaign.id}
          />
        )}
      </Card>

      <NewCampaignDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        organisationId={organisationId}
      />
    </div>
  );
}
