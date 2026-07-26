"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Select,
  Table,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface MembersClientProps {
  organisationId: string;
  currentUserId: string;
  canManageMembers: boolean;
  members: Member[];
  pendingInvitations: PendingInvitation[];
}

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

export function MembersClient({
  organisationId,
  currentUserId,
  canManageMembers,
  members,
  pendingInvitations,
}: MembersClientProps): React.ReactElement {
  const router = useRouter();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't send the invitation.");
        return;
      }
      toast.show(`Invitation sent to ${inviteEmail}`, "success");
      setInviteOpen(false);
      setInviteEmail("");
      router.refresh();
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    const response = await fetch(`/api/organisations/${organisationId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (response.ok) {
      toast.show("Role updated", "success");
      router.refresh();
    } else {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.show(body?.error ?? "Couldn't update role", "error");
    }
  }

  async function handleRemove(userId: string) {
    const response = await fetch(`/api/organisations/${organisationId}/members/${userId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      toast.show("Member removed", "success");
      router.refresh();
    } else {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.show(body?.error ?? "Couldn't remove member", "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canManageMembers ? (
        <div>
          <Button onClick={() => setInviteOpen(true)}>Invite member</Button>
          <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a teammate">
            {error ? (
              <div className="mb-4">
                <Alert tone="error" title="Couldn't send invitation">
                  {error}
                </Alert>
              </div>
            ) : null}
            <form id="invite-form" onSubmit={handleInvite} className="flex flex-col gap-4">
              <TextInput
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Select
                label="Role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                options={ROLE_OPTIONS}
              />
            </form>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="submit" form="invite-form" loading={inviting}>
                Send invitation
              </Button>
            </div>
          </Dialog>
        </div>
      ) : null}

      <Card padded={false}>
        <Table<Member>
          columns={[
            {
              key: "name",
              header: "Name",
              render: (m) => (
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-on-surface-variant">{m.email}</p>
                </div>
              ),
            },
            {
              key: "role",
              header: "Role",
              render: (m) =>
                canManageMembers && m.role !== "OWNER" ? (
                  <Select
                    label="Role"
                    hideLabel
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                    options={ROLE_OPTIONS}
                  />
                ) : (
                  <Badge tone={m.role === "OWNER" ? "primary" : "neutral"}>{m.role}</Badge>
                ),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (m) =>
                canManageMembers && m.role !== "OWNER" && m.userId !== currentUserId ? (
                  <Button variant="text" onClick={() => handleRemove(m.userId)}>
                    Remove
                  </Button>
                ) : null,
            },
          ]}
          rows={members}
          getRowKey={(m) => m.userId}
        />
      </Card>

      {pendingInvitations.length > 0 ? (
        <Card>
          <h2 className="text-lg font-medium text-on-surface">Pending invitations</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {pendingInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex items-center justify-between text-sm text-on-surface-variant"
              >
                <span>
                  {invitation.email} &middot; {invitation.role}
                </span>
                <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
