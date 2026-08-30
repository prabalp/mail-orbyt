"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Dialog, TextInput, useToast } from "@mail-orbyt/design-system";

export interface OrganisationClientProps {
  organisationId: string;
  organisationName: string;
  canDelete: boolean;
}

export function OrganisationClient({
  organisationId,
  organisationName,
  canDelete,
}: OrganisationClientProps): React.ReactElement {
  const router = useRouter();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName === organisationName;

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    if (!nameMatches) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/organisations/${organisationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(
          typeof body?.error === "string" ? body.error : "Couldn't delete the organisation.",
        );
        return;
      }
      toast.show(`${organisationName} has been deleted`, "success");
      // The active-organisation cookie now points at a deleted org — the
      // root page re-resolves it (falling back to another membership, or
      // onboarding if this was the user's last one) rather than 404ing.
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-lg font-medium text-on-surface">General</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          <span className="font-medium text-on-surface">Name:</span> {organisationName}
        </p>
      </Card>

      {canDelete ? (
        <Card className="border-error/40">
          <h2 className="text-lg font-medium text-error">Danger zone</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Permanently delete {organisationName} and everything in it: leads, campaigns,
            conversations, connected inboxes, research, all of it. This cannot be undone.
          </p>
          <div className="mt-4">
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Delete organisation
            </Button>
          </div>

          <Dialog
            open={confirmOpen}
            onClose={() => {
              setConfirmOpen(false);
              setConfirmName("");
              setError(null);
            }}
            title={`Delete ${organisationName}?`}
          >
            <div className="flex flex-col gap-4">
              <Alert tone="error" title="This is permanent">
                Every lead, campaign, conversation, connected inbox, and research fact belonging to
                this organisation will be erased immediately. There is no undo and no recovery
                window.
              </Alert>
              {error ? (
                <Alert tone="error" title="Couldn't delete organisation">
                  {error}
                </Alert>
              ) : null}
              <form id="delete-org-form" onSubmit={handleDelete} className="flex flex-col gap-2">
                <TextInput
                  label={`Type "${organisationName}" to confirm`}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoComplete="off"
                  required
                />
              </form>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="text" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="delete-org-form"
                variant="destructive"
                loading={deleting}
                disabled={!nameMatches}
              >
                Delete organisation
              </Button>
            </div>
          </Dialog>
        </Card>
      ) : null}
    </div>
  );
}
