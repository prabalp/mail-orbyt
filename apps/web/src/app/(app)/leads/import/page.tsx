"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  PageHeader,
  RadioGroup,
  Select,
  Stepper,
  Table,
  TextInput,
} from "@mail-orbyt/design-system";
import { useOrganisation } from "../../organisation-context";

const CANONICAL_COLUMNS = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "website_url", label: "Website URL" },
  { key: "industry", label: "Industry" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "country", label: "Country" },
  { key: "total_mails", label: "Total mails" },
  { key: "emails", label: "Imported emails (JSON)" },
] as const;

interface PreviewRow {
  rowNumber: number;
  row: Record<string, string>;
  errors: string[];
}

interface PreviewResponse {
  storageKey: string;
  fileName: string;
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  totalRowCount: number;
  previewRows: PreviewRow[];
}

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map columns" },
  { key: "name", label: "Name list" },
  { key: "strategy", label: "Duplicates" },
  { key: "done", label: "Import" },
];

/** Falls back to the file's own name so the required field is never a dead end — "contacts-q3.csv" becomes "contacts q3". */
function suggestListName(fileName: string): string {
  return fileName
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

export default function ImportLeadsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const router = useRouter();

  const [step, setStep] = useState<"upload" | "map" | "name" | "strategy" | "done">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState("SKIP");
  const [leadListName, setLeadListName] = useState("");
  const [leadListDescription, setLeadListDescription] = useState("");
  const [existingListNames, setExistingListNames] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<{
    status: string;
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    totalRows: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Existing names are loaded only to warn about a merge — reusing a name is
  // allowed (the API resolves it to the same list), it just shouldn't be a
  // surprise when the campaign picker shows one list holding both imports.
  useEffect(() => {
    fetch(`/api/organisations/${organisationId}/lead-lists`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) {
          setExistingListNames(data.leadLists.map((list: { name: string }) => list.name));
        }
      });
  }, [organisationId]);

  const trimmedListName = leadListName.trim();
  const listNameExists = existingListNames.some(
    (name) => name.toLowerCase() === trimmedListName.toLowerCase(),
  );

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/organisations/${organisationId}/leads/import/preview`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not process this file.");
        return;
      }
      const data = (await response.json()) as PreviewResponse;
      setPreview(data);
      const initialMapping: Record<string, string> = {};
      for (const column of CANONICAL_COLUMNS) {
        const suggested = data.suggestedMapping[column.key];
        if (suggested) initialMapping[column.key] = suggested;
      }
      setMapping(initialMapping);
      setLeadListName((current) => current || suggestListName(data.fileName));
      setStep("map");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const columnMapping: Record<string, string | null> = {};
      for (const column of CANONICAL_COLUMNS) {
        columnMapping[column.key] = mapping[column.key] ?? null;
      }

      const response = await fetch(`/api/organisations/${organisationId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: preview.storageKey,
          fileName: preview.fileName,
          columnMapping,
          duplicateStrategy,
          leadListName: leadListName.trim(),
          leadListDescription: leadListDescription.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not start the import.");
        return;
      }
      const data = await response.json();
      setStep("done");
      pollStatus(data.id);
    } finally {
      setSubmitting(false);
    }
  }

  function pollStatus(id: string) {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/organisations/${organisationId}/leads/import/${id}`);
      if (!response.ok) return;
      const data = await response.json();
      setBatchStatus(data.batch);
      if (data.batch.status === "COMPLETED" || data.batch.status === "FAILED") {
        clearInterval(interval);
      }
    }, 1200);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Import leads" />
      <Stepper
        steps={STEPS}
        activeStep={step}
        completedSteps={
          new Set(
            STEPS.slice(
              0,
              STEPS.findIndex((s) => s.key === step),
            ).map((s) => s.key),
          )
        }
      />

      {error ? (
        <Alert tone="error" title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      {step === "upload" ? (
        <Card>
          <h2 className="text-lg font-medium text-on-surface">Upload a CSV file</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Expected columns: first_name, last_name, title, company, linkedin_url, website_url,
            email, industry, city, state, country. Optional prewritten copy uses total_mails and
            emails. emails is a JSON array of {"{"}sequence, type, subject, body{"}"} — leave out
            the greeting and signature; those are added when the email is sent. Column names
            don&apos;t need to match exactly: you&apos;ll confirm the mapping next.
          </p>
          <div className="mt-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelected}
              disabled={uploading}
              className="text-sm"
            />
          </div>
          {uploading ? (
            <p className="mt-2 text-sm text-on-surface-variant">Uploading and parsing…</p>
          ) : null}
        </Card>
      ) : null}

      {step === "map" && preview ? (
        <>
          <Card>
            <h2 className="text-lg font-medium text-on-surface">Map columns</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {preview.totalRowCount} rows found in {preview.fileName}.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {CANONICAL_COLUMNS.map((column) => (
                <Select
                  key={column.key}
                  label={column.label}
                  value={mapping[column.key] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [column.key]: e.target.value }))
                  }
                  placeholder="Not mapped"
                  options={preview.headers.map((header) => ({ value: header, label: header }))}
                />
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-4">
              <h3 className="text-sm font-medium text-on-surface-variant">
                Preview (first {preview.previewRows.length} rows)
              </h3>
            </div>
            <Table
              columns={[
                { key: "row", header: "Row", render: (r: PreviewRow) => r.rowNumber },
                {
                  key: "data",
                  header: "Data",
                  render: (r: PreviewRow) => (
                    <span className="text-xs">
                      {Object.entries(r.row)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(" · ")}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r: PreviewRow) =>
                    r.errors.length > 0 ? (
                      <Badge tone="error">{r.errors.join("; ")}</Badge>
                    ) : (
                      <Badge tone="success">Valid</Badge>
                    ),
                },
              ]}
              rows={preview.previewRows}
              getRowKey={(r) => String(r.rowNumber)}
            />
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button onClick={() => setStep("name")}>Continue</Button>
          </div>
        </>
      ) : null}

      {step === "name" ? (
        <>
          <Card>
            <h2 className="text-lg font-medium text-on-surface">Name this list</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Every import is saved as a named lead list. Campaigns can then enrol the whole list in
              one step instead of you ticking prospects one by one.
            </p>
            <div className="mt-4 flex max-w-lg flex-col gap-4">
              <TextInput
                label="List name"
                required
                placeholder="e.g. Series B fintech CTOs, August"
                value={leadListName}
                onChange={(event) => setLeadListName(event.target.value)}
              />
              <TextInput
                label="Description (optional)"
                placeholder="Where this audience came from, how it was built…"
                value={leadListDescription}
                onChange={(event) => setLeadListDescription(event.target.value)}
              />
            </div>
            {listNameExists ? (
              <div className="mt-4">
                <Alert tone="warning" title="A list with this name already exists">
                  These leads will be added to the existing list rather than creating a new one.
                </Alert>
              </div>
            ) : null}
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button disabled={trimmedListName.length === 0} onClick={() => setStep("strategy")}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === "strategy" ? (
        <>
          <Card>
            <h2 className="text-lg font-medium text-on-surface">Duplicate handling</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              How should rows matching an existing lead&apos;s email be handled?
            </p>
            <div className="mt-4">
              <RadioGroup
                name="duplicateStrategy"
                label="Duplicate strategy"
                hideLabel
                value={duplicateStrategy}
                onChange={setDuplicateStrategy}
                options={[
                  { value: "SKIP", label: "Skip: keep the existing lead unchanged" },
                  {
                    value: "UPDATE_BLANKS",
                    label: "Fill blanks only: never overwrite existing values",
                  },
                  {
                    value: "OVERWRITE",
                    label: "Overwrite: incoming values replace existing ones",
                  },
                  {
                    value: "REJECT",
                    label: "Reject: flag as an error, import nothing for that row",
                  },
                  {
                    value: "ALLOW_SEPARATE",
                    label: "Allow separate: always create a new lead record",
                  },
                ]}
              />
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setStep("name")}>
              Back
            </Button>
            <Button
              loading={submitting}
              disabled={trimmedListName.length === 0}
              onClick={handleConfirmImport}
            >
              Start import
            </Button>
          </div>
        </>
      ) : null}

      {step === "done" ? (
        <Card>
          <h2 className="text-lg font-medium text-on-surface">
            {batchStatus?.status === "COMPLETED"
              ? "Import complete"
              : batchStatus?.status === "FAILED"
                ? "Import failed"
                : "Importing…"}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Importing into list <span className="font-medium">{trimmedListName}</span>.
          </p>
          {batchStatus ? (
            <div className="mt-4 flex gap-6 text-sm">
              <span>Imported: {batchStatus.importedCount}</span>
              <span>Skipped: {batchStatus.skippedCount}</span>
              <span>Errors: {batchStatus.errorCount}</span>
              <span>Total rows: {batchStatus.totalRows}</span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-on-surface-variant">
              Processing your file in the background…
            </p>
          )}
          {batchStatus?.status === "COMPLETED" || batchStatus?.status === "FAILED" ? (
            <Button className="mt-4" onClick={() => router.push("/leads")}>
              View leads
            </Button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
