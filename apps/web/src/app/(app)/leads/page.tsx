"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Pagination,
  PageHeader,
  Select,
  Table,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";
import { Users } from "lucide-react";
import { useOrganisation } from "../organisation-context";
import { LeadDetailDrawer } from "./lead-detail-drawer";

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  city: string | null;
  country: string | null;
  status: "ACTIVE" | "ARCHIVED";
}

interface LeadList {
  id: string;
  name: string;
  leadCount: number;
}

const PAGE_SIZE = 25;

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function LeadsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [leadListId, setLeadListId] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * "Every lead matching the current filter", not just the ticked rows. Kept
   * as a flag rather than by materialising every ID client-side: the server
   * re-resolves the filter for the action, so the set can't drift between the
   * click and the request, and a 50k-lead selection stays free.
   */
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filterPayload = {
    ...(search ? { search } : {}),
    status: status as "ACTIVE" | "ARCHIVED",
    ...(leadListId ? { leadListId } : {}),
  };

  function filterQuery(): string {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    query.set("status", status);
    if (leadListId) query.set("leadListId", leadListId);
    return query.toString();
  }

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL(`/api/organisations/${organisationId}/leads`, window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("status", status);
    if (search) url.searchParams.set("search", search);
    if (leadListId) url.searchParams.set("leadListId", leadListId);

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      setLeads(data.leads);
      setTotalCount(data.totalCount);
    }
    setLoading(false);
  }, [organisationId, page, search, status, leadListId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch(`/api/organisations/${organisationId}/lead-lists`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setLeadLists(data.leadLists);
      });
  }, [organisationId]);

  /** Changing what's on screen invalidates a selection that was made against the previous result set. */
  function resetSelection() {
    setSelected(new Set());
    setAllMatchingSelected(false);
  }

  const selectionCount = allMatchingSelected ? totalCount : selected.size;

  async function handleBulkAction(action: "archive" | "unarchive") {
    const response = await fetch(`/api/organisations/${organisationId}/leads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        allMatchingSelected
          ? { action, filter: filterPayload }
          : { action, leadIds: Array.from(selected) },
      ),
    });
    if (response.ok) {
      toast.show(action === "archive" ? "Leads archived" : "Leads restored", "success");
      resetSelection();
      void load();
    } else {
      toast.show("Something went wrong", "error");
    }
  }

  async function handleDelete() {
    // Deleting a lead cascades to its enrollments, queued and sent outbox
    // items, conversations and meetings — so the confirmation says the count
    // out loud rather than a vague "these leads".
    if (
      !window.confirm(
        `Permanently delete ${selectionCount} lead${selectionCount === 1 ? "" : "s"} and all associated data ` +
          `(email history, campaign enrollments, conversations, meetings)? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/leads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allMatchingSelected
            ? { action: "delete", filter: filterPayload }
            : { action: "delete", leadIds: Array.from(selected) },
        ),
      });
      if (response.ok) {
        const data = await response.json();
        toast.show(`Deleted ${data.deleted} lead${data.deleted === 1 ? "" : "s"}`, "success");
        resetSelection();
        setPage(1);
        void load();
      } else {
        toast.show("Could not delete leads", "error");
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleExportSelection() {
    setExporting(true);
    try {
      // "All matching" exports through the filtered GET so the server resolves
      // the set; an explicit tick-selection POSTs its IDs, which can run well
      // past what a URL would hold.
      const response = allMatchingSelected
        ? await fetch(`/api/organisations/${organisationId}/leads/export?${filterQuery()}`)
        : await fetch(`/api/organisations/${organisationId}/leads/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadIds: Array.from(selected) }),
          });

      if (!response.ok) {
        toast.show("Could not export leads", "error");
        return;
      }
      downloadBlob(await response.blob(), "leads-export.csv");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteList() {
    const list = leadLists.find((item) => item.id === leadListId);
    if (!list) return;
    if (
      !window.confirm(
        `Delete the list "${list.name}"? The ${list.leadCount} lead${list.leadCount === 1 ? "" : "s"} in it ` +
          `are kept — only the list is removed.`,
      )
    ) {
      return;
    }
    const response = await fetch(`/api/organisations/${organisationId}/lead-lists/${list.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      toast.show("Could not delete list", "error");
      return;
    }
    toast.show("List deleted");
    setLeadLists((current) => current.filter((item) => item.id !== list.id));
    setPage(1);
    resetSelection();
    setLeadListId("");
  }

  const hasFilter = Boolean(search || leadListId || status !== "ACTIVE");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        actions={
          <>
            {hasFilter ? (
              <a href={`/api/organisations/${organisationId}/leads/export?${filterQuery()}`}>
                <Button variant="outlined">Export filtered</Button>
              </a>
            ) : null}
            <a href={`/api/organisations/${organisationId}/leads/export`}>
              <Button variant="outlined">Export all</Button>
            </a>
            <Link href="/leads/import">
              <Button>Import CSV</Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64">
          <TextInput
            label="Search"
            hideLabel
            placeholder="Search name, email, title, company…"
            value={search}
            onChange={(e) => {
              setPage(1);
              resetSelection();
              setSearch(e.target.value);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            label="Status"
            hideLabel
            value={status}
            onChange={(e) => {
              setPage(1);
              resetSelection();
              setStatus(e.target.value);
            }}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
        </div>
        <div className="w-56">
          <Select
            label="Lead list"
            hideLabel
            value={leadListId}
            placeholder="All lists"
            onChange={(e) => {
              setPage(1);
              resetSelection();
              setLeadListId(e.target.value);
            }}
            options={leadLists.map((list) => ({
              value: list.id,
              label: `${list.name} (${list.leadCount})`,
            }))}
          />
        </div>
        {leadListId ? (
          <Button variant="outlined" onClick={handleDeleteList}>
            Delete list
          </Button>
        ) : null}
        {selectionCount > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">{selectionCount} selected</span>
            <Button variant="outlined" loading={exporting} onClick={handleExportSelection}>
              Export selected
            </Button>
            {status === "ACTIVE" ? (
              <Button variant="outlined" onClick={() => handleBulkAction("archive")}>
                Archive
              </Button>
            ) : (
              <Button variant="outlined" onClick={() => handleBulkAction("unarchive")}>
                Restore
              </Button>
            )}
            <Button variant="outlined" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {selected.size > 0 && selected.size === leads.length && totalCount > leads.length ? (
        <div className="flex items-center gap-3 rounded-md-md bg-primary-container/30 px-4 py-3 text-sm">
          {allMatchingSelected ? (
            <>
              <span>All {totalCount} leads matching this filter are selected.</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setAllMatchingSelected(false)}
              >
                Select only these {leads.length}
              </button>
            </>
          ) : (
            <>
              <span>All {leads.length} leads on this page are selected.</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setAllMatchingSelected(true)}
              >
                Select all {totalCount} matching this filter
              </button>
            </>
          )}
        </div>
      ) : null}

      <Card padded={false}>
        {!loading && leads.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users />}
              title="No leads yet"
              description="Import a CSV to get started."
              action={
                <Link href="/leads/import">
                  <Button>Import leads</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <Table<Lead>
            columns={[
              {
                key: "name",
                header: "Name",
                render: (lead) => (
                  <div>
                    <p className="font-medium">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(no name)"}
                    </p>
                    <p className="text-xs text-on-surface-variant">{lead.email}</p>
                  </div>
                ),
              },
              { key: "title", header: "Title", render: (lead) => lead.title ?? "—" },
              {
                key: "location",
                header: "Location",
                render: (lead) => [lead.city, lead.country].filter(Boolean).join(", ") || "—",
              },
              {
                key: "status",
                header: "Status",
                render: (lead) => (
                  <Badge tone={lead.status === "ACTIVE" ? "success" : "neutral"}>
                    {lead.status}
                  </Badge>
                ),
              },
            ]}
            rows={leads}
            getRowKey={(lead) => lead.id}
            onRowClick={(lead) => setOpenLeadId(lead.id)}
            selectedKeys={selected}
            onSelectRow={(key, isSelected) => {
              const next = new Set(selected);
              if (isSelected) next.add(key);
              else next.delete(key);
              setSelected(next);
              // Un-ticking a row means the selection is no longer "everything
              // matching", so the whole-filter escalation has to drop away too.
              if (!isSelected) setAllMatchingSelected(false);
            }}
            onSelectAllRows={(isSelected) => {
              setSelected(isSelected ? new Set(leads.map((lead) => lead.id)) : new Set());
              if (!isSelected) setAllMatchingSelected(false);
            }}
          />
        )}
      </Card>

      {totalCount > 0 ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={totalCount}
          onPageChange={(next) => {
            resetSelection();
            setPage(next);
          }}
        />
      ) : null}

      <LeadDetailDrawer
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        onDeleted={() => {
          resetSelection();
          void load();
        }}
      />
    </div>
  );
}
