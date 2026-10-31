"use client";

import { useState } from "react";
import { Button, Card, Select, TextInput, useToast } from "@mail-orbyt/design-system";

export interface PersonalTokenRow {
  id: string;
  name: string;
  scope: string;
  createdAt: string;
  /** null = never expires. */
  expiresAt: string | null;
}

export interface PersonalTokensClientProps {
  organisationId: string;
  mcpUrl: string;
  tokens: PersonalTokenRow[];
}

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

function CopyField({ label, value }: { label: string; value: string }): React.ReactElement {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-outline-variant bg-surface px-2 py-1.5 font-mono text-xs text-on-surface">
          {value}
        </code>
        <Button
          variant="outlined"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            toast.show(`${label} copied`, "success");
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

export function PersonalTokensClient({
  organisationId,
  mcpUrl,
  tokens: initialTokens,
}: PersonalTokensClientProps): React.ReactElement {
  const toast = useToast();
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string; mcpUrl: string } | null>(null);

  const baseUrl = `/api/organisations/${organisationId}/settings/mcp-tokens`;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      });
      if (!response.ok) {
        toast.show("Couldn't create the token.", "error");
        return;
      }
      const body = (await response.json()) as {
        token: string;
        mcpUrl: string;
        personalToken: PersonalTokenRow;
      };
      setCreated({ token: body.token, mcpUrl: body.mcpUrl });
      setTokens((current) => [body.personalToken, ...current]);
      setName("");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    setRevokingId(tokenId);
    try {
      const response = await fetch(`${baseUrl}/${tokenId}`, { method: "DELETE" });
      if (response.ok) {
        setTokens((current) => current.filter((t) => t.id !== tokenId));
        toast.show("Token revoked", "success");
      } else {
        toast.show("Couldn't revoke this token.", "error");
      }
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-on-surface">Personal access tokens</h2>
        <p className="text-sm text-on-surface-variant">
          For apps that connect with a fixed token instead of signing in. Send it as{" "}
          <code className="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code> to the MCP
          URL. A token can do whatever your role in this organisation can do.
        </p>
      </div>

      <Card>
        <div className="mb-4">
          <CopyField label="MCP URL" value={mcpUrl} />
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextInput
              label="Token name"
              placeholder="e.g. Orbytlink"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="sm:w-40">
            <Select
              label="Expires"
              options={EXPIRY_OPTIONS}
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </div>
          <Button type="submit" loading={creating} disabled={!name.trim()}>
            Generate token
          </Button>
        </form>

        {created && (
          <div className="mt-4 flex flex-col gap-3 rounded border border-primary p-3">
            <p className="text-sm font-medium text-on-surface">
              Copy this token now. You won&apos;t be able to see it again.
            </p>
            <CopyField label="MCP URL" value={created.mcpUrl} />
            <CopyField label="Token" value={created.token} />
            <CopyField label="Header" value={`Authorization: Bearer ${created.token}`} />
            <div>
              <Button variant="text" size="sm" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Card>

      {tokens.map((token) => (
        <Card key={token.id}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-on-surface">{token.name}</h3>
              <p className="text-xs text-on-surface-variant">
                Created {new Date(token.createdAt).toLocaleDateString()} ·{" "}
                {token.expiresAt
                  ? `Expires ${new Date(token.expiresAt).toLocaleDateString()}`
                  : "Never expires"}
              </p>
            </div>
            <Button
              variant="outlined"
              onClick={() => handleRevoke(token.id)}
              loading={revokingId === token.id}
            >
              Revoke
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
