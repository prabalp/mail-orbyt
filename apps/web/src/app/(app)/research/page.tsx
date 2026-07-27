"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, PageHeader, Table } from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface ResearchJobRow {
  id: string;
  subjectType: "LEAD" | "COMPANY";
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  createdAt: string;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  company: { id: string; name: string } | null;
}

const STATUS_TONE: Record<ResearchJobRow["status"], "success" | "neutral" | "error" | "warning"> = {
  PENDING: "neutral",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "error",
};

export default function ResearchPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const [jobs, setJobs] = useState<ResearchJobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/organisations/${organisationId}/research`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setJobs(data.jobs);
      })
      .finally(() => setLoading(false));
  }, [organisationId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Deterministic, source-linked research runs across your leads and companies."
      />

      <Card padded={false}>
        {!loading && jobs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No research runs yet"
              description="Open a lead or company and click “Run research” to gather publicly available facts."
            />
          </div>
        ) : (
          <Table<ResearchJobRow>
            columns={[
              {
                key: "subject",
                header: "Subject",
                render: (job) =>
                  job.subjectType === "LEAD" && job.lead ? (
                    <span>
                      {[job.lead.firstName, job.lead.lastName].filter(Boolean).join(" ") ||
                        job.lead.email}
                      <span className="ml-1 text-xs text-on-surface-variant">(lead)</span>
                    </span>
                  ) : job.company ? (
                    <Link
                      href={`/companies/${job.company.id}`}
                      className="text-primary hover:underline"
                    >
                      {job.company.name}{" "}
                      <span className="text-xs text-on-surface-variant">(company)</span>
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "status",
                header: "Status",
                render: (job) => <Badge tone={STATUS_TONE[job.status]}>{job.status}</Badge>,
              },
              {
                key: "createdAt",
                header: "Started",
                render: (job) => new Date(job.createdAt).toLocaleString(),
              },
            ]}
            rows={jobs}
            getRowKey={(job) => job.id}
          />
        )}
      </Card>
    </div>
  );
}
