"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  Pagination,
  PageHeader,
  Table,
  TextInput,
} from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
}

const PAGE_SIZE = 25;

export default function CompaniesPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL(`/api/organisations/${organisationId}/companies`, window.location.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (search) url.searchParams.set("search", search);

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      setCompanies(data.companies);
      setTotalCount(data.totalCount);
    }
    setLoading(false);
  }, [organisationId, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Companies" />

      <div className="w-64">
        <TextInput
          label="Search"
          hideLabel
          placeholder="Search name or domain…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      <Card padded={false}>
        {!loading && companies.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No companies yet"
              description="Companies are created automatically when you import leads with a company name."
            />
          </div>
        ) : (
          <Table<Company>
            columns={[
              {
                key: "name",
                header: "Name",
                render: (company) => (
                  <Link
                    href={`/companies/${company.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {company.name}
                  </Link>
                ),
              },
              { key: "domain", header: "Domain", render: (company) => company.domain ?? "—" },
              { key: "industry", header: "Industry", render: (company) => company.industry ?? "—" },
            ]}
            rows={companies}
            getRowKey={(company) => company.id}
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
    </div>
  );
}
