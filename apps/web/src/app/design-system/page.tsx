"use client";

import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  DatePicker,
  Dialog,
  Drawer,
  DropdownMenu,
  EmptyState,
  IconButton,
  MetricCard,
  Pagination,
  RadioGroup,
  Select,
  Skeleton,
  Stepper,
  StatusIndicator,
  Switch,
  Table,
  Tabs,
  TextArea,
  TextInput,
  TimePicker,
  ToastProvider,
  Tooltip,
  useToast,
} from "@mail-orbyt/design-system";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold text-on-surface">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <div className="flex gap-2">
      <Button variant="outlined" onClick={() => show("Saved successfully", "success")}>
        Show success toast
      </Button>
      <Button variant="outlined" onClick={() => show("Something went wrong", "error")}>
        Show error toast
      </Button>
    </div>
  );
}

interface DemoRow {
  id: string;
  name: string;
  status: "active" | "paused";
}

const DEMO_ROWS: DemoRow[] = [
  { id: "1", name: "Acme Inc outreach", status: "active" },
  { id: "2", name: "Q3 partner campaign", status: "paused" },
];

export default function DesignSystemPage(): React.ReactElement {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const [radioValue, setRadioValue] = useState("weekly");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return (
    <ToastProvider>
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">
        <header>
          <h1 className="text-[32px] font-semibold text-on-surface">Design system</h1>
          <p className="mt-1 text-base text-on-surface-variant">
            Every reusable component and its states, for visual QA during development.
          </p>
        </header>

        <Section title="Buttons">
          <Button variant="filled">Filled</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="filled" disabled>
            Disabled
          </Button>
          <Button variant="filled" loading>
            Loading
          </Button>
          <IconButton label="Add" icon={<span aria-hidden="true">+</span>} />
        </Section>

        <Section title="Inputs">
          <TextInput label="Email" placeholder="jane@example.com" />
          <TextInput label="Email" error="Email is required" />
          <TextArea label="Notes" placeholder="Add context…" />
          <Select
            label="Timezone"
            placeholder="Select a timezone"
            options={[
              { value: "utc", label: "UTC" },
              { value: "est", label: "Eastern" },
            ]}
          />
          <Checkbox
            label="Send weekly digest"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <Switch
            label="Campaign active"
            checked={switchOn}
            onChange={(e) => setSwitchOn(e.target.checked)}
          />
          <RadioGroup
            name="cadence"
            label="Cadence"
            value={radioValue}
            onChange={setRadioValue}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
          <DatePicker label="Follow-up date" value={date} onChange={setDate} />
          <TimePicker label="Send time" value={time} onChange={setTime} />
        </Section>

        <Section title="Feedback">
          <Badge tone="primary">Primary</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="error">Error</Badge>
          <Chip>Filter chip</Chip>
          <Chip selected>Selected chip</Chip>
          <Chip onClick={() => {}} onRemove={() => {}}>
            Removable
          </Chip>
          <StatusIndicator tone="success" label="Delivering" />
          <StatusIndicator tone="error" label="Bounced" />
        </Section>

        <Section title="Alerts">
          <Alert tone="info" title="Heads up">
            Research is still gathering facts for 3 leads.
          </Alert>
          <Alert tone="error" title="Sending paused">
            Bounce rate exceeded the configured safety threshold.
          </Alert>
        </Section>

        <Section title="Toasts">
          <ToastDemo />
        </Section>

        <Section title="Overlays">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Pause campaign?"
            footer={
              <>
                <Button variant="text" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => setDialogOpen(false)}>
                  Pause
                </Button>
              </>
            }
          >
            Sending will stop immediately for all remaining prospects in this campaign.
          </Dialog>

          <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
          <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Lead detail">
            <p className="text-sm text-on-surface-variant">Lead detail content goes here.</p>
          </Drawer>

          <DropdownMenu
            trigger={<Button variant="outlined">Actions ⌄</Button>}
            items={[
              { key: "edit", label: "Edit", onSelect: () => {} },
              { key: "archive", label: "Archive", onSelect: () => {} },
              { key: "delete", label: "Delete", onSelect: () => {}, destructive: true },
            ]}
          />

          <Tooltip content="Sent 2 hours ago">
            <span className="cursor-default text-sm text-on-surface-variant underline decoration-dotted">
              Hover for detail
            </span>
          </Tooltip>
        </Section>

        <Section title="Navigation">
          <Tabs
            tabs={[
              {
                key: "overview",
                label: "Overview",
                content: <p className="text-sm">Overview panel</p>,
              },
              { key: "steps", label: "Steps", content: <p className="text-sm">Steps panel</p> },
              {
                key: "locked",
                label: "Locked",
                content: <p className="text-sm">Locked</p>,
                disabled: true,
              },
            ]}
          />
          <Stepper
            steps={[
              { key: "import", label: "Import" },
              { key: "research", label: "Research" },
              { key: "review", label: "Review" },
            ]}
            activeStep="research"
            completedSteps={new Set(["import"])}
          />
        </Section>

        <Section title="Data display">
          <Card className="w-full max-w-md">
            <p className="text-lg font-medium text-on-surface">Card title</p>
            <p className="mt-1 text-sm text-on-surface-variant">Card body content.</p>
          </Card>
          <MetricCard
            label="Qualified meeting rate"
            value="4.2%"
            trend={{ direction: "up", label: "+0.8pp vs last month" }}
          />
          <div className="w-full">
            <Table<DemoRow>
              columns={[
                { key: "name", header: "Campaign", render: (row) => row.name },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => (
                    <Badge tone={row.status === "active" ? "success" : "neutral"}>
                      {row.status}
                    </Badge>
                  ),
                },
              ]}
              rows={DEMO_ROWS}
              getRowKey={(row) => row.id}
              selectedKeys={selected}
              onSelectRow={(key, isSelected) => {
                const next = new Set(selected);
                if (isSelected) next.add(key);
                else next.delete(key);
                setSelected(next);
              }}
            />
          </div>
          <div className="w-full">
            <Pagination page={page} pageSize={10} totalItems={42} onPageChange={setPage} />
          </div>
        </Section>

        <Section title="Loading & empty states">
          <div className="flex w-64 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="w-full max-w-md">
            <EmptyState
              title="No leads yet"
              description="Import a CSV to get started."
              action={<Button>Import leads</Button>}
            />
          </div>
        </Section>
      </div>
    </ToastProvider>
  );
}
