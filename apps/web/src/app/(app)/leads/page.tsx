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

const PAGE_SIZE = 25;

export default function LeadsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL(`/api/organisations/${organisationId}/leads`, window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("status", status);
    if (search) url.searchParams.set("search", search);

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      setLeads(data.leads);
      setTotalCount(data.totalCount);
    }
    setLoading(false);
  }, [organisationId, page, search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleBulkAction(action: "archive" | "unarchive") {
    const response = await fetch(`/api/organisations/${organisationId}/leads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, leadIds: Array.from(selected) }),
    });
    if (response.ok) {
      toast.show(action === "archive" ? "Leads archived" : "Leads restored", "success");
      setSelected(new Set());
      void load();
    } else {
      toast.show("Something went wrong", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        actions={
          <>
            <a href={`/api/organisations/${organisationId}/leads/export`}>
              <Button variant="outlined">Export CSV</Button>
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
            placeholder="Search name, email, title…"
            value={search}
            onChange={(e) => {
              setPage(1);
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
              setStatus(e.target.value);
            }}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
        </div>
        {selected.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">{selected.size} selected</span>
            {status === "ACTIVE" ? (
              <Button variant="outlined" onClick={() => handleBulkAction("archive")}>
                Archive
              </Button>
            ) : (
              <Button variant="outlined" onClick={() => handleBulkAction("unarchive")}>
                Restore
              </Button>
            )}
          </div>
        ) : null}
      </div>

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
            }}
          />
        )}
      </Card>

      {totalCount > 0 ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={totalCount}
          onPageChange={setPage}
        />
      ) : null}

      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
    </div>
  );
}
