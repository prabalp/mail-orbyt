"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Drawer, Skeleton, Badge, useToast } from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";
import { ResearchPanel } from "../_components/ResearchPanel";
import { EmailDraftPanel } from "../_components/EmailDraftPanel";
import { LeadEmailHistory } from "./lead-email-history";

interface LeadDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
}

interface CompanyDetail {
  id: string;
  name: string;
}

export function LeadDetailDrawer({
  leadId,
  onClose,
  onDeleted,
}: {
  leadId: string | null;
  onClose: () => void;
  /** Lets the parent list drop the now-dangling row without a full refetch race. */
  onDeleted?: () => void;
}): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    setLead(null);
    setCompany(null);
    fetch(`/api/organisations/${organisationId}/leads/${leadId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) {
          setLead(data.lead);
          setCompany(data.company);
        }
      })
      .finally(() => setLoading(false));
  }, [leadId, organisationId]);

  const name = lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(no name)" : "";

  async function handleExport() {
    if (!lead) return;
    const response = await fetch(`/api/organisations/${organisationId}/leads/${lead.id}/export`);
    if (!response.ok) {
      toast.show("Could not export lead data", "error");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lead-${lead.id}-export.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    if (!lead) return;
    if (
      !window.confirm(
        "Permanently delete this lead and all associated data? This cannot be undone.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/leads/${lead.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.show("Lead data deleted", "success");
        onDeleted?.();
        onClose();
      } else {
        toast.show("Could not delete lead data", "error");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Drawer
      open={leadId !== null}
      onClose={onClose}
      title={loading ? "Loading…" : name || "Lead detail"}
      resizable
      resizeStorageKey="lead-detail-drawer-width"
      minWidth={360}
      maxWidth={960}
      defaultWidth={420}
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : lead ? (
        <dl className="flex flex-col gap-4 text-sm">
          <div>
            <dt className="text-on-surface-variant">Status</dt>
            <dd className="mt-1">
              <Badge tone={lead.status === "ACTIVE" ? "success" : "neutral"}>{lead.status}</Badge>
            </dd>
          </div>
          {lead.title ? (
            <div>
              <dt className="text-on-surface-variant">Title</dt>
              <dd className="mt-1 text-on-surface">{lead.title}</dd>
            </div>
          ) : null}
          {lead.email ? (
            <div>
              <dt className="text-on-surface-variant">Email</dt>
              <dd className="mt-1 text-on-surface">{lead.email}</dd>
            </div>
          ) : null}
          {company ? (
            <div>
              <dt className="text-on-surface-variant">Company</dt>
              <dd className="mt-1">
                <Link href={`/companies/${company.id}`} className="text-primary hover:underline">
                  {company.name}
                </Link>
              </dd>
            </div>
          ) : null}
          {lead.linkedinUrl ? (
            <div>
              <dt className="text-on-surface-variant">LinkedIn</dt>
              <dd className="mt-1">
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {lead.linkedinUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {lead.websiteUrl ? (
            <div>
              <dt className="text-on-surface-variant">Website</dt>
              <dd className="mt-1">
                <a
                  href={lead.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {lead.websiteUrl}
                </a>
              </dd>
            </div>
          ) : null}
          {lead.industry ? (
            <div>
              <dt className="text-on-surface-variant">Industry</dt>
              <dd className="mt-1 text-on-surface">{lead.industry}</dd>
            </div>
          ) : null}
          {lead.city || lead.state || lead.country ? (
            <div>
              <dt className="text-on-surface-variant">Location</dt>
              <dd className="mt-1 text-on-surface">
                {[lead.city, lead.state, lead.country].filter(Boolean).join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {lead ? (
        <div className="mt-6 border-t border-outline/20 pt-6">
          <ResearchPanel subjectType="LEAD" leadId={lead.id} />
        </div>
      ) : null}

      {lead ? (
        <div className="mt-6 border-t border-outline/20 pt-6">
          <EmailDraftPanel leadId={lead.id} />
        </div>
      ) : null}

      {lead ? (
        <div className="mt-6 border-t border-outline/20 pt-6">
          <LeadEmailHistory leadId={lead.id} />
        </div>
      ) : null}

      {lead ? (
        <div className="mt-6 flex gap-2 border-t border-outline/20 pt-6">
          <Button variant="outlined" onClick={handleExport}>
            Export data
          </Button>
          <Button variant="outlined" loading={deleting} onClick={handleDelete}>
            Delete lead data
          </Button>
        </div>
      ) : null}
    </Drawer>
  );
}
