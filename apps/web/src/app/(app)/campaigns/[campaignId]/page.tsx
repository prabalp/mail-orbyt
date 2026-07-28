"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  PageHeader,
  Select,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";
import { ListOrdered, Mails } from "lucide-react";
import { useOrganisation } from "../../organisation-context";

interface Step {
  id: string;
  orderIndex: number;
  stepType: "INITIAL" | "FOLLOW_UP" | "CLOSE_THE_LOOP";
  delayDays: number;
  useAiGeneration: boolean;
  callToActionOverride: string | null;
  manualSubject: string | null;
  manualBody: string | null;
}

interface Inbox {
  id: string;
  emailAddress: string;
  status: string;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  steps: Step[];
  inboxes: { inboxId: string; inbox: Inbox }[];
  enrollments: { status: string }[];
}

interface Enrollment {
  leadId: string;
  status: string;
  lead: { firstName: string | null; lastName: string | null; email: string | null };
}

interface LeadSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export default function CampaignDetailPage(): React.ReactElement {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { organisationId } = useOrganisation();
  const toast = useToast();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [allInboxes, setAllInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);

  const [newStepType, setNewStepType] = useState<Step["stepType"]>("INITIAL");
  const [newCallToAction, setNewCallToAction] = useState("book a 15 minute intro call");
  const [addingStep, setAddingStep] = useState(false);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    const [campaignRes, enrollmentsRes, inboxesRes] = await Promise.all([
      fetch(`/api/organisations/${organisationId}/campaigns/${campaignId}`),
      fetch(`/api/organisations/${organisationId}/campaigns/${campaignId}/enrollments`),
      fetch(`/api/organisations/${organisationId}/inboxes`),
    ]);
    if (campaignRes.ok) setCampaign(await campaignRes.json());
    if (enrollmentsRes.ok) setEnrollments((await enrollmentsRes.json()).enrollments);
    if (inboxesRes.ok) setAllInboxes((await inboxesRes.json()).inboxes);
    setLoading(false);
  }, [organisationId, campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddStep() {
    setAddingStep(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/campaigns/${campaignId}/steps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stepType: newStepType,
            delayDays: newStepType === "INITIAL" ? 0 : 3,
            callToActionOverride: newCallToAction,
          }),
        },
      );
      if (response.ok) {
        await load();
      } else {
        toast.show("Could not add step", "error");
      }
    } finally {
      setAddingStep(false);
    }
  }

  async function handleRemoveStep(stepId: string) {
    const response = await fetch(
      `/api/organisations/${organisationId}/campaigns/${campaignId}/steps/${stepId}`,
      { method: "DELETE" },
    );
    if (response.ok) await load();
    else toast.show("Could not remove step", "error");
  }

  async function handleMoveStep(index: number, direction: -1 | 1) {
    if (!campaign) return;
    const ids = campaign.steps.map((s) => s.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex]!, ids[index]!];

    const response = await fetch(
      `/api/organisations/${organisationId}/campaigns/${campaignId}/steps`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedStepIds: ids }),
      },
    );
    if (response.ok) await load();
    else toast.show("Could not reorder steps", "error");
  }

  async function handleToggleInbox(inboxId: string, checked: boolean) {
    if (!campaign) return;
    const current = new Set(campaign.inboxes.map((i) => i.inboxId));
    if (checked) current.add(inboxId);
    else current.delete(inboxId);

    const response = await fetch(
      `/api/organisations/${organisationId}/campaigns/${campaignId}/inboxes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxIds: [...current] }),
      },
    );
    if (response.ok) await load();
    else toast.show("Could not update inbox pool", "error");
  }

  async function handleStatusChange(status: CampaignDetail["status"]) {
    const response = await fetch(`/api/organisations/${organisationId}/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      await load();
    } else {
      const data = await response.json().catch(() => ({}));
      toast.show(data.error ?? "Could not update campaign status", "error");
    }
  }

  async function handleLeadSearch() {
    const url = new URL(`/api/organisations/${organisationId}/leads`, window.location.origin);
    if (leadSearch) url.searchParams.set("search", leadSearch);
    url.searchParams.set("pageSize", "20");
    const response = await fetch(url);
    if (response.ok) setLeadResults((await response.json()).leads);
  }

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/campaigns/${campaignId}/enrollments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: [...selectedLeadIds] }),
        },
      );
      if (response.ok) {
        const result = await response.json();
        toast.show(
          `Enrolled ${result.enrolled}, ${result.suppressed} suppressed, ${result.alreadyEnrolled} already enrolled`,
          "success",
        );
        setSelectedLeadIds(new Set());
        setLeadResults([]);
        setLeadSearch("");
        await load();
      } else {
        toast.show("Could not enroll leads", "error");
      }
    } finally {
      setEnrolling(false);
    }
  }

  if (loading || !campaign) return <p className="text-sm text-on-surface-variant">Loading…</p>;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={campaign.name}
        description={`Status: ${campaign.status}`}
        actions={
          <Select
            label="Status"
            hideLabel
            value={campaign.status}
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "ACTIVE", label: "Active" },
              { value: "PAUSED", label: "Paused" },
              { value: "COMPLETED", label: "Completed" },
            ]}
            onChange={(event) => handleStatusChange(event.target.value as CampaignDetail["status"])}
          />
        }
      />

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">Sequence steps</h3>
        {campaign.steps.length === 0 ? (
          <EmptyState
            icon={<ListOrdered />}
            title="No steps yet"
            description="Add the first step in this campaign's sequence."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {campaign.steps.map((step, index) => (
              <li key={step.id} className="rounded-md-md border border-outline/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Badge tone="neutral">{step.stepType.replace(/_/g, " ")}</Badge>
                    <span className="ml-2 text-sm text-on-surface-variant">
                      {step.delayDays === 0
                        ? "sent immediately"
                        : `${step.delayDays} day(s) after previous`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="text"
                      onClick={() => handleMoveStep(index, -1)}
                      disabled={index === 0}
                    >
                      Up
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => handleMoveStep(index, 1)}
                      disabled={index === campaign.steps.length - 1}
                    >
                      Down
                    </Button>
                    <Button variant="text" onClick={() => handleRemoveStep(step.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {step.useAiGeneration
                    ? `AI-generated — call to action: "${step.callToActionOverride ?? "(default)"}"`
                    : `Manual — "${step.manualSubject}"`}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-outline/15 pt-6">
          <Select
            label="Step type"
            value={newStepType}
            options={[
              { value: "INITIAL", label: "Initial" },
              { value: "FOLLOW_UP", label: "Follow-up" },
              { value: "CLOSE_THE_LOOP", label: "Close the loop" },
            ]}
            onChange={(event) => setNewStepType(event.target.value as Step["stepType"])}
          />
          <TextInput
            label="Call to action"
            value={newCallToAction}
            onChange={(event) => setNewCallToAction(event.target.value)}
          />
          <Button loading={addingStep} onClick={handleAddStep}>
            Add step
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">Sending inbox pool</h3>
        {allInboxes.length === 0 ? (
          <EmptyState
            icon={<Mails />}
            title="No inboxes connected"
            description="Connect a Gmail inbox on the Inboxes page first."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {allInboxes.map((inbox) => (
              <li key={inbox.id} className="flex items-center gap-2">
                <Checkbox
                  label={inbox.emailAddress}
                  checked={campaign.inboxes.some((i) => i.inboxId === inbox.id)}
                  onChange={(event) => handleToggleInbox(inbox.id, event.target.checked)}
                  disabled={inbox.status !== "CONNECTED"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">
          Enrollments ({enrollments.length})
        </h3>

        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Search leads to enroll"
            value={leadSearch}
            onChange={(event) => setLeadSearch(event.target.value)}
          />
          <Button variant="outlined" onClick={handleLeadSearch}>
            Search
          </Button>
        </div>

        {leadResults.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            {leadResults.map((lead) => (
              <Checkbox
                key={lead.id}
                label={`${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(no name)"} — ${lead.email ?? "no email"}`}
                checked={selectedLeadIds.has(lead.id)}
                onChange={(event) => {
                  setSelectedLeadIds((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) next.add(lead.id);
                    else next.delete(lead.id);
                    return next;
                  });
                }}
              />
            ))}
            <Button
              loading={enrolling}
              disabled={selectedLeadIds.size === 0}
              onClick={handleEnroll}
            >
              Enroll {selectedLeadIds.size || ""} selected
            </Button>
          </div>
        ) : null}

        {enrollments.length > 0 ? (
          <ul className="mt-6 flex flex-col gap-2 border-t border-outline/15 pt-4">
            {enrollments.map((enrollment) => (
              <li key={enrollment.leadId} className="flex items-center justify-between text-sm">
                <span>
                  {[enrollment.lead.firstName, enrollment.lead.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                    enrollment.lead.email ||
                    "(unknown)"}
                </span>
                <Badge tone={enrollment.status === "SUPPRESSED" ? "error" : "neutral"}>
                  {enrollment.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
