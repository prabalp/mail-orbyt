"use client";

import { useState } from "react";
import { AppShell, Breadcrumbs, PageHeader, Card } from "@mail-orbyt/design-system";

/**
 * Standalone preview of the authenticated application shell (sidebar, top
 * nav, org switcher, notifications, breadcrumbs) using placeholder demo
 * data. Real session/organisation/member data is wired in once
 * authentication lands (Phase 2) — this route exists purely for visual QA
 * of the shell layout itself, separate from the atomic component gallery at
 * /design-system.
 */
export default function ShellPreviewPage(): React.ReactElement {
  const [activeOrg, setActiveOrg] = useState("org-demo-1");

  return (
    <AppShell
      activeNavKey="leads"
      organisations={[
        { id: "org-demo-1", name: "Acme Inc (demo)" },
        { id: "org-demo-2", name: "Globex Corp (demo)" },
      ]}
      activeOrganisationId={activeOrg}
      onSwitchOrganisation={setActiveOrg}
      onCreateOrganisation={() => {}}
      user={{ name: "Jane Doe (demo)", email: "jane@example.com" }}
      onProfile={() => {}}
      onSignOut={() => {}}
      notifications={[
        { id: "n1", message: "New reply from Acme Inc (demo)", read: false },
        { id: "n2", message: "Meeting booked with Globex Corp (demo)", read: true },
      ]}
      onOpenNotification={() => {}}
      breadcrumbs={
        <Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: "Jane Doe" }]} />
      }
    >
      <PageHeader title="Leads" description="Shell layout preview — demo data only." />
      <Card className="mt-6">
        <p className="text-sm text-on-surface-variant">
          This page demonstrates the responsive application shell (Phase 1). Lead data, navigation
          state, and organisation membership are wired up starting in Phase 2/3.
        </p>
      </Card>
    </AppShell>
  );
}
