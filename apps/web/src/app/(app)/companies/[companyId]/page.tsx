"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, EmptyState, PageHeader, Skeleton, Table } from "@mail-orbyt/design-system";
import { useOrganisation } from "../../organisation-context";

interface CompanyDetail {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  websiteUrl: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface LeadRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
}

export default function CompanyDetailPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const params = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/organisations/${organisationId}/companies/${params.companyId}`)
      .then(async (response) => {
        if (!response.ok) {
          setNotFound(true);
          return;
        }
        const data = await response.json();
        setCompany(data.company);
        setLeads(data.leads);
      })
      .finally(() => setLoading(false));
  }, [organisationId, params.companyId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (notFound || !company) {
    return <EmptyState title="Company not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={company.name}
        description={[company.domain, company.industry].filter(Boolean).join(" · ") || undefined}
      />

      <Card>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {company.websiteUrl ? (
            <div>
              <dt className="text-on-surface-variant">Website</dt>
              <dd className="mt-1">
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.websiteUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {company.city || company.state || company.country ? (
            <div>
              <dt className="text-on-surface-variant">Location</dt>
              <dd className="mt-1 text-on-surface">
                {[company.city, company.state, company.country].filter(Boolean).join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card padded={false}>
        <div className="p-4">
          <h2 className="text-lg font-medium text-on-surface">Leads at this company</h2>
        </div>
        {leads.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No leads linked to this company yet" />
          </div>
        ) : (
          <Table<LeadRow>
            columns={[
              {
                key: "name",
                header: "Name",
                render: (lead) =>
                  [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(no name)",
              },
              { key: "title", header: "Title", render: (lead) => lead.title ?? "—" },
              { key: "email", header: "Email", render: (lead) => lead.email ?? "—" },
            ]}
            rows={leads}
            getRowKey={(lead) => lead.id}
          />
        )}
      </Card>
    </div>
  );
}
