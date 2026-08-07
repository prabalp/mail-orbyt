"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  PageHeader,
  Select,
  TextInput,
  TimePicker,
  useToast,
} from "@mail-orbyt/design-system";
import { ChevronDown, ChevronRight, ListOrdered, Mails } from "lucide-react";
import { useOrganisation } from "../../organisation-context";

function CollapsibleCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h3 className="text-sm font-medium text-on-surface-variant">{title}</h3>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </Card>
  );
}

const DAYS_OF_WEEK: { value: number; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const RECOMMENDED_SCHEDULE = {
  sendingDaysOfWeek: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  inboxCooldownMinutes: 3,
};

/** Per-inbox gap options. Off is offered because a one-off internal blast is a legitimate (if unhealthy) choice. */
const COOLDOWN_OPTIONS = [0, 1, 2, 3, 5, 10, 15, 30, 60].map((minutes) => ({
  value: String(minutes),
  label: minutes === 0 ? "Off — send as fast as possible" : `${minutes} min`,
}));

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function recommendedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

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
  timezone: string;
  sendingDaysOfWeek: number[];
  sendingWindowStartMinute: number;
  sendingWindowEndMinute: number;
  inboxCooldownMinutes: number;
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
  const router = useRouter();
  const toast = useToast();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [allInboxes, setAllInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [newStepType, setNewStepType] = useState<Step["stepType"]>("INITIAL");
  const [newCallToAction, setNewCallToAction] = useState("book a 15 minute intro call");
  const [addingStep, setAddingStep] = useState(false);

  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchResult[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  const [scheduleDays, setScheduleDays] = useState<Set<number>>(
    new Set(RECOMMENDED_SCHEDULE.sendingDaysOfWeek),
  );
  const [scheduleStart, setScheduleStart] = useState(
    minutesToTime(RECOMMENDED_SCHEDULE.startMinute),
  );
  const [scheduleEnd, setScheduleEnd] = useState(minutesToTime(RECOMMENDED_SCHEDULE.endMinute));
  const [scheduleTimezone, setScheduleTimezone] = useState(recommendedTimezone());
  const [scheduleCooldown, setScheduleCooldown] = useState(
    String(RECOMMENDED_SCHEDULE.inboxCooldownMinutes),
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleInitialized = useRef(false);

  const [testEmail1, setTestEmail1] = useState("");
  const [testEmail2, setTestEmail2] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    subject: string;
    body: string;
    results: { email: string; ok: boolean; error?: string }[];
  } | null>(null);

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

  useEffect(() => {
    if (!campaign || scheduleInitialized.current) return;
    scheduleInitialized.current = true;
    setScheduleDays(new Set(campaign.sendingDaysOfWeek));
    setScheduleStart(minutesToTime(campaign.sendingWindowStartMinute));
    setScheduleEnd(minutesToTime(campaign.sendingWindowEndMinute));
    setScheduleTimezone(campaign.timezone);
    setScheduleCooldown(String(campaign.inboxCooldownMinutes));
  }, [campaign]);

  function handleUseRecommendedSchedule() {
    setScheduleDays(new Set(RECOMMENDED_SCHEDULE.sendingDaysOfWeek));
    setScheduleStart(minutesToTime(RECOMMENDED_SCHEDULE.startMinute));
    setScheduleEnd(minutesToTime(RECOMMENDED_SCHEDULE.endMinute));
    setScheduleTimezone(recommendedTimezone());
    setScheduleCooldown(String(RECOMMENDED_SCHEDULE.inboxCooldownMinutes));
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: scheduleTimezone,
          sendingDaysOfWeek: [...scheduleDays].sort((a, b) => a - b),
          sendingWindowStartMinute: timeToMinutes(scheduleStart),
          sendingWindowEndMinute: timeToMinutes(scheduleEnd),
          inboxCooldownMinutes: Number(scheduleCooldown),
        }),
      });
      if (response.ok) {
        toast.show("Sending schedule saved", "success");
        await load();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.show(data.error ?? "Could not save sending schedule", "error");
      }
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleSendTest() {
    const emails = [testEmail1, testEmail2].map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/campaigns/${campaignId}/send-test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setTestResult(data);
        const failed = data.results.filter((r: { ok: boolean }) => !r.ok).length;
        toast.show(
          failed ? `Sent with ${failed} failure(s)` : "Test email sent",
          failed ? "error" : "success",
        );
      } else {
        toast.show(data.error ?? "Could not send test email", "error");
      }
    } finally {
      setSendingTest(false);
    }
  }

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

  async function handleDeleteCampaign() {
    if (!campaign) return;
    const confirmed = window.confirm(
      `Delete "${campaign.name}"? This stops all sending and removes it from your campaign list. This cannot be undone from the UI.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/campaigns/${campaignId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.show("Campaign deleted", "success");
        router.push("/campaigns");
      } else {
        const data = await response.json().catch(() => ({}));
        toast.show(data.error ?? "Could not delete campaign", "error");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleSendNow() {
    setSendingNow(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/campaigns/${campaignId}/send-now`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast.show(
          `Considered ${data.considered}, sent ${data.sent}, failed ${data.failed}, skipped ${data.skipped}, waiting on inbox cooldown ${data.deferred}`,
          data.failed ? "error" : "success",
        );
        await load();
      } else {
        toast.show(data.error ?? "Could not send campaign now", "error");
      }
    } finally {
      setSendingNow(false);
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
          <div className="flex items-center gap-2">
            {process.env.NODE_ENV !== "production" ? (
              <Button
                variant="outlined"
                loading={sendingNow}
                disabled={campaign.status !== "ACTIVE"}
                onClick={handleSendNow}
              >
                Send now (dev)
              </Button>
            ) : null}
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
              onChange={(event) =>
                handleStatusChange(event.target.value as CampaignDetail["status"])
              }
            />
            <Button variant="outlined" loading={deleting} onClick={handleDeleteCampaign}>
              Delete campaign
            </Button>
          </div>
        }
      />

      <CollapsibleCard title="Sending schedule">
        <div className="mb-4 flex justify-end">
          <Button variant="text" onClick={handleUseRecommendedSchedule}>
            Use recommended
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {DAYS_OF_WEEK.map((day) => (
              <Checkbox
                key={day.value}
                label={day.label}
                checked={scheduleDays.has(day.value)}
                onChange={(event) => {
                  setScheduleDays((prev) => {
                    const next = new Set(prev);
                    if (event.target.checked) next.add(day.value);
                    else next.delete(day.value);
                    return next;
                  });
                }}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <TimePicker
              label="Start"
              value={scheduleStart}
              onChange={(v) => setScheduleStart(v ?? scheduleStart)}
            />
            <TimePicker
              label="End"
              value={scheduleEnd}
              onChange={(v) => setScheduleEnd(v ?? scheduleEnd)}
            />
            <Select
              label="Timezone"
              value={scheduleTimezone}
              options={COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
              onChange={(event) => setScheduleTimezone(event.target.value)}
            />
            <Select
              label="Gap between sends (per inbox)"
              value={scheduleCooldown}
              options={COOLDOWN_OPTIONS}
              onChange={(event) => setScheduleCooldown(event.target.value)}
            />
            <Button loading={savingSchedule} onClick={handleSaveSchedule}>
              Save schedule
            </Button>
          </div>
          <p className="text-sm text-on-surface-variant">
            Emails for this campaign only send on the selected days, within this time window, in the
            chosen timezone. Recommended default: weekdays, 9:00–17:00, your local timezone — adjust
            as needed before or after going live.
          </p>
          <p className="text-sm text-on-surface-variant">
            The gap applies to each inbox separately — one inbox waits that long between its own
            emails instead of sending a whole batch at once, which is what mailbox providers treat
            as spam. Inboxes don&apos;t wait on each other: with three inboxes in the pool and a 3
            min gap, roughly three emails go out every 3 minutes, one from each.
          </p>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Send test email">
        <p className="mb-4 text-sm text-on-surface-variant">
          Sends this campaign&apos;s first step to 1-2 addresses you control — exactly what a real
          prospect would receive — so you can check formatting, signature, and tone before going
          live. This never enrolls a real lead or affects campaign progress.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Test email 1"
            type="email"
            value={testEmail1}
            onChange={(event) => setTestEmail1(event.target.value)}
          />
          <TextInput
            label="Test email 2 (optional)"
            type="email"
            value={testEmail2}
            onChange={(event) => setTestEmail2(event.target.value)}
          />
          <Button loading={sendingTest} disabled={!testEmail1.trim()} onClick={handleSendTest}>
            Send test
          </Button>
        </div>

        {testResult ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-outline/15 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {testResult.results.map((result) => (
                <Badge key={result.email} tone={result.ok ? "success" : "error"}>
                  {result.email}: {result.ok ? "sent" : (result.error ?? "failed")}
                </Badge>
              ))}
            </div>
            <div className="rounded-md-md border border-outline/30 p-3">
              <p className="text-sm font-medium text-on-surface">Subject: {testResult.subject}</p>
              <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">
                {testResult.body}
              </p>
            </div>
          </div>
        ) : null}
      </CollapsibleCard>

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
