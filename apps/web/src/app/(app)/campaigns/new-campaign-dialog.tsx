"use client";

import { FileSpreadsheet, FileText, GitBranch, ListOrdered, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Checkbox, Dialog, Select, TextInput, useToast } from "@mail-orbyt/design-system";

type RoutingMode = "LINEAR" | "JOURNEY";
type ContentSource = "AI" | "TEMPLATE" | "IMPORTED";

interface InboxOption {
  id: string;
  emailAddress: string;
  status: string;
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const TIMEZONES = [
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

const COOLDOWNS = [0, 1, 2, 3, 5, 10, 15, 30, 60];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** One selectable card in a "pick one" group. Disabled cards say why, instead of just greying out. */
function ChoiceCard({
  selected,
  disabled,
  disabledReason,
  icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex flex-1 flex-col items-start gap-1 rounded-md-md border p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary-container/40 ring-1 ring-primary"
          : "border-outline/40 hover:bg-on-surface/5"
      } ${disabled ? "cursor-not-allowed opacity-50 hover:bg-transparent" : ""}`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </span>
      <span className="text-xs text-on-surface-variant">
        {disabled && disabledReason ? disabledReason : description}
      </span>
    </button>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium text-on-surface">{title}</h3>
        {hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function NewCampaignDialog({
  open,
  onClose,
  organisationId,
}: {
  open: boolean;
  onClose: () => void;
  organisationId: string;
}): React.ReactElement {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [routingMode, setRoutingMode] = useState<RoutingMode>("LINEAR");
  const [contentSource, setContentSource] = useState<ContentSource>("AI");
  const [inboxes, setInboxes] = useState<InboxOption[]>([]);
  const [selectedInboxes, setSelectedInboxes] = useState<Set<string>>(new Set());
  const [showSchedule, setShowSchedule] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [cooldown, setCooldown] = useState("3");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTimezone(browserTimezone());
    let cancelled = false;
    fetch(`/api/organisations/${organisationId}/inboxes`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { inboxes: InboxOption[] } | null) => {
        if (cancelled || !data) return;
        const connected = data.inboxes.filter((inbox) => inbox.status === "CONNECTED");
        setInboxes(connected);
        setSelectedInboxes(new Set(connected.map((inbox) => inbox.id)));
      });
    return () => {
      cancelled = true;
    };
  }, [open, organisationId]);

  // Journeys can't use AI-written emails yet, so choosing one moves AI to a
  // written template rather than leaving an invalid combination selected.
  function chooseRouting(mode: RoutingMode) {
    setRoutingMode(mode);
    if (mode === "JOURNEY" && contentSource === "AI") setContentSource("TEMPLATE");
  }

  const timezoneOptions = useMemo(
    () => [...new Set([timezone, ...TIMEZONES])].map((zone) => ({ value: zone, label: zone })),
    [timezone],
  );

  const scheduleError =
    days.size === 0
      ? "Pick at least one sending day."
      : toMinutes(end) <= toMinutes(start)
        ? "The sending window must end after it starts."
        : null;

  function reset() {
    setName("");
    setRoutingMode("LINEAR");
    setContentSource("AI");
    setShowSchedule(false);
    setDays(new Set([1, 2, 3, 4, 5]));
    setStart("09:00");
    setEnd("17:00");
    setCooldown("3");
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          routingMode,
          contentSource,
          timezone,
          sendingDaysOfWeek: [...days].sort((a, b) => a - b),
          sendingWindowStartMinute: toMinutes(start),
          sendingWindowEndMinute: toMinutes(end),
          inboxCooldownMinutes: Number(cooldown),
        }),
      });
      const campaign = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!response.ok || !campaign?.id) {
        toast.show(campaign?.error ?? "Could not create campaign", "error");
        return;
      }
      if (selectedInboxes.size > 0) {
        const pool = await fetch(
          `/api/organisations/${organisationId}/campaigns/${campaign.id}/inboxes`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inboxIds: [...selectedInboxes] }),
          },
        );
        if (!pool.ok) toast.show("Campaign created, but its inboxes could not be set", "error");
      }
      reset();
      onClose();
      router.push(`/campaigns/${campaign.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New campaign"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={creating}
            disabled={!name.trim() || Boolean(scheduleError)}
            onClick={handleCreate}
          >
            Create campaign
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <TextInput
          label="Campaign name"
          value={name}
          autoFocus
          placeholder="e.g. Q4 outreach to CTOs"
          onChange={(event) => setName(event.target.value)}
        />

        <Section title="How should it send?" hint="You can change this later while it's a draft.">
          <div
            role="radiogroup"
            aria-label="Sequence type"
            className="flex flex-col gap-2 sm:flex-row"
          >
            <ChoiceCard
              selected={routingMode === "LINEAR"}
              icon={<ListOrdered size={16} />}
              title="Linear sequence"
              description="Every lead gets the same steps in order: intro, then follow-ups after a wait. A reply stops it."
              onSelect={() => chooseRouting("LINEAR")}
            />
            <ChoiceCard
              selected={routingMode === "JOURNEY"}
              icon={<GitBranch size={16} />}
              title="Journey"
              description="Branches on what happens: replies, silence, opens. You draw the paths on a canvas."
              onSelect={() => chooseRouting("JOURNEY")}
            />
          </div>
        </Section>

        <Section title="Where do the emails come from?">
          <div
            role="radiogroup"
            aria-label="Email source"
            className="flex flex-col gap-2 sm:flex-row"
          >
            <ChoiceCard
              selected={contentSource === "AI"}
              disabled={routingMode === "JOURNEY"}
              disabledReason="Not available for journeys yet — write the emails or use your uploaded list."
              icon={<Sparkles size={16} />}
              title="AI-written"
              description="Each email is written for the lead from your research, following a campaign prompt."
              onSelect={() => setContentSource("AI")}
            />
            <ChoiceCard
              selected={contentSource === "TEMPLATE"}
              icon={<FileText size={16} />}
              title="My template"
              description="You write the subject and body once, with {{variables}} like {{firstName}}."
              onSelect={() => setContentSource("TEMPLATE")}
            />
            <ChoiceCard
              selected={contentSource === "IMPORTED"}
              icon={<FileSpreadsheet size={16} />}
              title="My uploaded list"
              description="Each lead has its own prewritten emails in your CSV; those are sent as-is."
              onSelect={() => setContentSource("IMPORTED")}
            />
          </div>
          {contentSource !== "AI" ? (
            <p className="text-xs text-on-surface-variant">
              The AI email prompt is hidden for this campaign, since nothing is written by AI.
            </p>
          ) : null}
        </Section>

        <Section
          title="Sending inboxes"
          hint="Emails rotate across the inboxes you pick. You can change this later."
        >
          {inboxes.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No connected inbox yet.{" "}
              <Link href="/inboxes" className="text-primary hover:underline">
                Connect one
              </Link>{" "}
              before activating the campaign.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {inboxes.map((inbox) => (
                <Checkbox
                  key={inbox.id}
                  label={inbox.emailAddress}
                  checked={selectedInboxes.has(inbox.id)}
                  onChange={(event) => {
                    const next = new Set(selectedInboxes);
                    if (event.target.checked) next.add(inbox.id);
                    else next.delete(inbox.id);
                    setSelectedInboxes(next);
                  }}
                />
              ))}
            </div>
          )}
        </Section>

        <section className="rounded-md-md border border-outline/30 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showSchedule}
            onClick={() => setShowSchedule((value) => !value)}
          >
            <span>
              <span className="block text-sm font-medium text-on-surface">Sending schedule</span>
              <span className="block text-xs text-on-surface-variant">
                {[...days].length === 5 && [1, 2, 3, 4, 5].every((d) => days.has(d))
                  ? "Mon–Fri"
                  : `${days.size} day${days.size === 1 ? "" : "s"}`}
                , {start}–{end} {timezone} · {cooldown === "0" ? "no gap" : `${cooldown} min gap`}{" "}
                per inbox
              </span>
            </span>
            <span className="text-xs text-primary">{showSchedule ? "Hide" : "Edit"}</span>
          </button>
          {showSchedule ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                {DAYS.map((day) => (
                  <Checkbox
                    key={day.value}
                    label={day.label}
                    checked={days.has(day.value)}
                    onChange={(event) => {
                      const next = new Set(days);
                      if (event.target.checked) next.add(day.value);
                      else next.delete(day.value);
                      setDays(next);
                    }}
                  />
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="From"
                  type="time"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
                <TextInput
                  label="Until"
                  type="time"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
                <Select
                  label="Timezone"
                  value={timezone}
                  options={timezoneOptions}
                  onChange={(event) => setTimezone(event.target.value)}
                />
                <Select
                  label="Gap between sends from one inbox"
                  value={cooldown}
                  options={COOLDOWNS.map((minutes) => ({
                    value: String(minutes),
                    label: minutes === 0 ? "Off" : `${minutes} min`,
                  }))}
                  onChange={(event) => setCooldown(event.target.value)}
                />
              </div>
              {scheduleError ? <p className="text-sm text-error">{scheduleError}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </Dialog>
  );
}
