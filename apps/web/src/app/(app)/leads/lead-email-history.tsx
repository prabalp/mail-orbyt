"use client";

import { useEffect, useState } from "react";
import { Badge, Skeleton, type BadgeTone } from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface EmailHistoryEntry {
  id: string;
  status: string;
  subject: string | null;
  body: string | null;
  sentAt: string | null;
  scheduledFor: string;
  lastError: string | null;
  attempts: number;
  campaign: { id: string; name: string };
  step: { id: string; orderIndex: number; stepType: string };
  inbox: { id: string; emailAddress: string } | null;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  SENT: "success",
  SCHEDULED: "neutral",
  SENDING: "neutral",
  FAILED: "error",
  SKIPPED_SUPPRESSED: "warning",
  CANCELLED: "neutral",
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STEP_TYPE_LABEL: Record<string, string> = {
  INITIAL: "Initial",
  FOLLOW_UP: "Follow-up",
  CLOSE_THE_LOOP: "Close the loop",
};

/**
 * The full outbound record for one lead: what was sent, from which campaign
 * step and inbox, when, and the exact copy. Entries that never left (failed,
 * suppressed, cancelled) are shown alongside sends, since "why did they never
 * hear from us" is answered by the same list.
 */
export function LeadEmailHistory({ leadId }: { leadId: string }): React.ReactElement {
  const { organisationId } = useOrganisation();
  const [emails, setEmails] = useState<EmailHistoryEntry[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setEmails(null);
    fetch(`/api/organisations/${organisationId}/leads/${leadId}/emails`)
      .then((response) => (response.ok ? response.json() : { emails: [] }))
      .then((data) => setEmails(data.emails));
  }, [organisationId, leadId]);

  if (!emails) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-on-surface-variant">
        Email history ({emails.length})
      </h3>

      {emails.length === 0 ? (
        <p className="mt-2 text-sm text-on-surface-variant">
          No emails have been scheduled or sent to this lead yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {emails.map((email) => {
            const expanded = expandedId === email.id;
            return (
              <li key={email.id} className="rounded-md-md border border-outline/20 p-3">
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 text-left"
                  onClick={() => setExpandedId(expanded ? null : email.id)}
                  aria-expanded={expanded}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-on-surface">
                      {email.subject ?? "(not yet generated)"}
                    </span>
                    <Badge tone={STATUS_TONE[email.status] ?? "neutral"}>{email.status}</Badge>
                  </div>
                  <span className="text-xs text-on-surface-variant">
                    {email.campaign.name} · Step {email.step.orderIndex + 1} (
                    {STEP_TYPE_LABEL[email.step.stepType] ?? email.step.stepType})
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {email.sentAt
                      ? `Sent ${formatTimestamp(email.sentAt)}`
                      : `Scheduled for ${formatTimestamp(email.scheduledFor)}`}
                    {email.inbox ? ` · from ${email.inbox.emailAddress}` : ""}
                  </span>
                </button>

                {email.lastError ? (
                  <p className="mt-2 text-xs text-error">{email.lastError}</p>
                ) : null}

                {expanded ? (
                  <pre className="mt-3 whitespace-pre-wrap border-t border-outline/15 pt-3 text-xs text-on-surface">
                    {email.body ?? "(no body recorded: this email was never materialized)"}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
