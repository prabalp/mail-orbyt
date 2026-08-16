"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  AppShell,
  Button,
  Dialog,
  TextInput,
  ToastProvider,
  useToast,
  type LinkComponentProps,
} from "@mail-orbyt/design-system";
import { signOutAction } from "./actions";

function NextLink({ href, className, children }: LinkComponentProps): React.ReactElement {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export interface AppShellClientProps {
  organisations: { id: string; name: string }[];
  activeOrganisationId: string;
  user: { name: string; email: string };
  children: React.ReactNode;
}

function AppShellInner({
  organisations,
  activeOrganisationId,
  user,
  children,
}: AppShellClientProps): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const activeNavKey = pathname.split("/").filter(Boolean)[0] ?? "overview";

  const [createOpen, setCreateOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitchOrganisation(organisationId: string) {
    const response = await fetch("/api/organisations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisationId }),
    });
    if (response.ok) {
      router.refresh();
    }
  }

  async function handleCreateOrganisation(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(typeof body?.error === "string" ? body.error : "Couldn't create the organisation.");
        return;
      }
      const created = (await response.json()) as { id: string };

      // A new organisation is created with the caller as its only member —
      // switching to it is always allowed, so this can't fail the way an
      // arbitrary organisationId from elsewhere could.
      await handleSwitchOrganisation(created.id);

      toast.show(`${newOrgName} created`, "success");
      setCreateOpen(false);
      setNewOrgName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell
      activeNavKey={activeNavKey}
      organisations={organisations}
      activeOrganisationId={activeOrganisationId}
      onSwitchOrganisation={handleSwitchOrganisation}
      onCreateOrganisation={() => setCreateOpen(true)}
      user={user}
      onProfile={() => router.push("/settings/members")}
      onSignOut={() => void signOutAction()}
      notifications={[]}
      onOpenNotification={() => {}}
      LinkComponent={NextLink}
    >
      {children}

      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setNewOrgName("");
          setError(null);
        }}
        title="Create an organisation"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">
            You&apos;ll be its owner. Your other organisations — and your access to them — are
            unaffected.
          </p>
          {error ? (
            <Alert tone="error" title="Couldn't create organisation">
              {error}
            </Alert>
          ) : null}
          <form
            id="create-org-form"
            onSubmit={handleCreateOrganisation}
            className="flex flex-col gap-2"
          >
            <TextInput
              label="Organisation name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
            />
          </form>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="text" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-org-form" loading={creating}>
            Create organisation
          </Button>
        </div>
      </Dialog>
    </AppShell>
  );
}

export function AppShellClient(props: AppShellClientProps): React.ReactElement {
  return (
    <ToastProvider>
      <AppShellInner {...props} />
    </ToastProvider>
  );
}
