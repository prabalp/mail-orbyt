"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, MetricCard, PageHeader, Table } from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  uniqueProspectsContacted: number;
  qualifiedMeetingsBooked: number;
  rate: number | null;
}

interface AnalyticsResponse {
  overall: {
    uniqueProspectsContacted: number;
    qualifiedMeetingsBooked: number;
    rate: number | null;
  };
  replyRate: number | null;
  campaigns: CampaignMetrics[];
}

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default function AnalyticsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/analytics`);
    if (response.ok) {
      setData(await response.json());
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) return <p className="text-sm text-on-surface-variant">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Analytics"
        description="The qualified meeting rate is the primary metric — meetings a human confirmed as qualified, divided by unique prospects actually contacted. Not open rate."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Qualified meeting rate"
          value={formatRate(data.overall.rate)}
          helperText={`${data.overall.qualifiedMeetingsBooked} qualified meetings / ${data.overall.uniqueProspectsContacted} prospects contacted`}
        />
        <MetricCard
          label="Unique prospects contacted"
          value={String(data.overall.uniqueProspectsContacted)}
        />
        <MetricCard
          label="Reply rate (context only)"
          value={formatRate(data.replyRate)}
          helperText="Secondary metric — not the primary success measure"
        />
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">By campaign</h3>
        {data.campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to see its metrics here."
          />
        ) : (
          <Table
            columns={[
              {
                key: "name",
                header: "Campaign",
                render: (row: CampaignMetrics) => row.campaignName,
              },
              {
                key: "contacted",
                header: "Prospects contacted",
                align: "right",
                render: (row: CampaignMetrics) => String(row.uniqueProspectsContacted),
              },
              {
                key: "meetings",
                header: "Qualified meetings",
                align: "right",
                render: (row: CampaignMetrics) => String(row.qualifiedMeetingsBooked),
              },
              {
                key: "rate",
                header: "Qualified meeting rate",
                align: "right",
                render: (row: CampaignMetrics) => formatRate(row.rate),
              },
            ]}
            rows={data.campaigns}
            getRowKey={(row) => row.campaignId}
          />
        )}
      </Card>
    </div>
  );
}
