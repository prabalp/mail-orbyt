"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyState, MetricCard, PageHeader, Table } from "@mail-orbyt/design-system";
import { LayoutDashboard } from "lucide-react";
import { useOrganisation } from "../organisation-context";

interface InboxNeedingAttention {
  id: string;
  emailAddress: string;
  displayName: string | null;
  status: string;
  dailySendLimit: number;
}

interface UnhealthyDomain {
  domain: string;
  spfStatus: string;
  dkimStatus: string;
  dmarcStatus: string;
  checkedAt: string;
}

interface OverviewResponse {
  inboxes: {
    total: number;
    connected: number;
    needingAttention: InboxNeedingAttention[];
    dailySendCapacity: number;
  };
  dns: {
    checkedDomains: number;
    unhealthyDomains: UnhealthyDomain[];
  };
  campaigns: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    list: { id: string; name: string; status: string }[];
  };
  leads: { active: number; suppressed: number };
  conversationsNeedingReview: number | null;
  analytics: { replyRate: number | null; rate: number | null } | null;
}

function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function dnsBadgeTone(status: string): "success" | "error" {
  return status === "PASS" ? "success" : "error";
}

export default function OverviewPage(): React.ReactElement {
  const { organisationId, organisationName, role } = useOrganisation();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/overview`);
    if (response.ok) {
      setData(await response.json());
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" description={`${organisationName} · ${role}`} />
        <p className="text-sm text-on-surface-variant">Loading…</p>
      </div>
    );
  }

  const hasAnyData =
    data.inboxes.total > 0 ||
    data.campaigns.total > 0 ||
    data.leads.active > 0 ||
    data.leads.suppressed > 0;

  if (!hasAnyData) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" description={`${organisationName} · ${role}`} />
        <EmptyState
          icon={<LayoutDashboard />}
          title="Nothing to show yet"
          description="Import leads and launch your first campaign to see qualified meeting rate, delivery, and reply metrics here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Overview" description={`${organisationName} · ${role}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active leads"
          value={String(data.leads.active)}
          helperText={`${data.leads.suppressed} suppressed`}
        />
        <MetricCard
          label="Connected inboxes"
          value={`${data.inboxes.connected} / ${data.inboxes.total}`}
          helperText={`${data.inboxes.dailySendCapacity} daily send capacity`}
        />
        <MetricCard
          label="Active campaigns"
          value={`${data.campaigns.active} / ${data.campaigns.total}`}
        />
        <MetricCard
          label="Conversations needing review"
          value={
            data.conversationsNeedingReview === null ? "—" : String(data.conversationsNeedingReview)
          }
        />
      </div>

      {data.analytics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard label="Qualified meeting rate" value={formatRate(data.analytics.rate)} />
          <MetricCard
            label="Reply rate"
            value={formatRate(data.analytics.replyRate)}
            helperText="Secondary metric, not the primary success measure"
          />
        </div>
      ) : null}

      {data.inboxes.needingAttention.length > 0 ? (
        <Card>
          <h3 className="mb-4 text-sm font-medium text-on-surface-variant">
            Inboxes needing attention
          </h3>
          <Table
            columns={[
              {
                key: "email",
                header: "Inbox",
                render: (row: InboxNeedingAttention) => row.displayName ?? row.emailAddress,
              },
              {
                key: "status",
                header: "Status",
                render: (row: InboxNeedingAttention) => <Badge tone="warning">{row.status}</Badge>,
              },
            ]}
            rows={data.inboxes.needingAttention}
            getRowKey={(row) => row.id}
          />
        </Card>
      ) : null}

      {data.dns.unhealthyDomains.length > 0 ? (
        <Card>
          <h3 className="mb-4 text-sm font-medium text-on-surface-variant">
            Domains with DNS issues
          </h3>
          <Table
            columns={[
              {
                key: "domain",
                header: "Domain",
                render: (row: UnhealthyDomain) => row.domain,
              },
              {
                key: "spf",
                header: "SPF",
                render: (row: UnhealthyDomain) => (
                  <Badge tone={dnsBadgeTone(row.spfStatus)}>{row.spfStatus}</Badge>
                ),
              },
              {
                key: "dkim",
                header: "DKIM",
                render: (row: UnhealthyDomain) => (
                  <Badge tone={dnsBadgeTone(row.dkimStatus)}>{row.dkimStatus}</Badge>
                ),
              },
              {
                key: "dmarc",
                header: "DMARC",
                render: (row: UnhealthyDomain) => (
                  <Badge tone={dnsBadgeTone(row.dmarcStatus)}>{row.dmarcStatus}</Badge>
                ),
              },
            ]}
            rows={data.dns.unhealthyDomains}
            getRowKey={(row) => row.domain}
          />
        </Card>
      ) : null}

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">Campaigns</h3>
        {data.campaigns.list.length === 0 ? (
          <EmptyState
            icon={<LayoutDashboard />}
            title="No campaigns yet"
            description="Create a campaign to see it here."
          />
        ) : (
          <Table
            columns={[
              {
                key: "name",
                header: "Campaign",
                render: (row: { id: string; name: string; status: string }) => row.name,
              },
              {
                key: "status",
                header: "Status",
                align: "right",
                render: (row: { id: string; name: string; status: string }) => (
                  <Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status}</Badge>
                ),
              },
            ]}
            rows={data.campaigns.list}
            getRowKey={(row) => row.id}
          />
        )}
      </Card>
    </div>
  );
}
