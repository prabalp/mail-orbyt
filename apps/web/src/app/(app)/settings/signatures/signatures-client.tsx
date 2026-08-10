"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState, TextArea, TextInput, useToast } from "@mail-orbyt/design-system";

interface Signature {
  id: string;
  organisationId: string;
  label: string;
  content: string;
  isDefault: boolean;
}

export interface SignaturesClientProps {
  organisationId: string;
  canManage: boolean;
  initialSignatures: Signature[];
}

export function SignaturesClient({
  organisationId,
  canManage,
  initialSignatures,
}: SignaturesClientProps): React.ReactElement {
  const toast = useToast();
  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures);
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function reload() {
    const response = await fetch(`/api/organisations/${organisationId}/signatures`);
    if (response.ok) setSignatures((await response.json()).signatures);
  }

  async function handleAdd() {
    if (!newLabel || !newContent) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/organisations/${organisationId}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, content: newContent }),
      });
      if (response.ok) {
        setNewLabel("");
        setNewContent("");
        await reload();
      } else {
        toast.show("Could not save signature", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(signature: Signature) {
    setEditingId(signature.id);
    setEditLabel(signature.label);
    setEditContent(signature.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditContent("");
  }

  async function handleSaveEdit(signatureId: string) {
    if (!editLabel || !editContent) return;
    setSavingEdit(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/signatures/${signatureId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: editLabel, content: editContent }),
        },
      );
      if (response.ok) {
        cancelEdit();
        await reload();
      } else {
        toast.show("Could not update signature", "error");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSetDefault(signatureId: string) {
    const response = await fetch(`/api/organisations/${organisationId}/signatures/${signatureId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (response.ok) await reload();
    else toast.show("Could not set default signature", "error");
  }

  async function handleDelete(signatureId: string) {
    const response = await fetch(`/api/organisations/${organisationId}/signatures/${signatureId}`, {
      method: "DELETE",
    });
    if (response.ok) await reload();
    else toast.show("Could not delete signature", "error");
  }

  const helperText = (
    <p className="text-xs text-on-surface-variant">
      Use <code>{"{senderName}"}</code> to insert the sending inbox&apos;s name, and paste links (or{" "}
      <code>[label](https://...)</code>) to include clickable links. Line breaks are kept exactly as
      written.
    </p>
  );

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {signatures.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {signatures.map((signature) =>
              editingId === signature.id ? (
                <li key={signature.id} className="rounded-md-md border border-outline/30 p-3">
                  <div className="flex flex-col gap-3">
                    <TextInput
                      label="Label"
                      value={editLabel}
                      onChange={(event) => setEditLabel(event.target.value)}
                      disabled={!canManage}
                    />
                    <TextArea
                      label="Signature text"
                      value={editContent}
                      onChange={(event) => setEditContent(event.target.value)}
                      disabled={!canManage}
                    />
                    {helperText}
                    <div className="flex items-center gap-2">
                      <Button
                        loading={savingEdit}
                        disabled={!canManage || !editLabel || !editContent}
                        onClick={() => handleSaveEdit(signature.id)}
                      >
                        Save
                      </Button>
                      <Button variant="text" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={signature.id} className="rounded-md-md border border-outline/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-on-surface">{signature.label}</p>
                      {signature.isDefault ? <Badge tone="success">Default</Badge> : null}
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        {!signature.isDefault ? (
                          <Button variant="text" onClick={() => handleSetDefault(signature.id)}>
                            Set default
                          </Button>
                        ) : null}
                        <Button variant="text" onClick={() => startEdit(signature)}>
                          Edit
                        </Button>
                        <Button variant="text" onClick={() => handleDelete(signature.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">
                    {signature.content}
                  </p>
                </li>
              ),
            )}
          </ul>
        ) : (
          <EmptyState
            title="No signatures yet"
            description="Add one below — the default signature is appended to every AI-generated email, from any connected inbox."
          />
        )}

        {canManage ? (
          <div className="flex flex-col gap-3 border-t border-outline/15 pt-4">
            <TextInput
              label="Label"
              placeholder="e.g. Default, Formal"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
            />
            <TextArea
              label="Signature text"
              placeholder={"Best,\n{senderName}"}
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
            />
            {helperText}
            <Button loading={saving} disabled={!newLabel || !newContent} onClick={handleAdd}>
              Add signature
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
