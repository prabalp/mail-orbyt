"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  TextArea,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";
import { Mails } from "lucide-react";
import { useOrganisation } from "../organisation-context";

interface Inbox {
  id: string;
  emailAddress: string;
  displayName: string | null;
  status: "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED" | "ERROR";
  dailySendLimit: number;
  createdAt: string;
}

interface Signature {
  id: string;
  inboxId: string;
  label: string;
  content: string;
  isDefault: boolean;
}

interface DnsCheck {
  id: string;
  domain: string;
  spfStatus: "PASS" | "FAIL" | "MISSING" | "UNKNOWN";
  dkimStatus: "PASS" | "FAIL" | "MISSING" | "UNKNOWN";
  dmarcStatus: "PASS" | "FAIL" | "MISSING" | "UNKNOWN";
  dkimSelector: string | null;
}

const INBOX_STATUS_TONE: Record<Inbox["status"], "success" | "warning" | "neutral" | "error"> = {
  CONNECTED: "success",
  REAUTH_REQUIRED: "warning",
  DISCONNECTED: "neutral",
  ERROR: "error",
};

const DNS_STATUS_TONE: Record<DnsCheck["spfStatus"], "success" | "error" | "warning" | "neutral"> =
  {
    PASS: "success",
    FAIL: "error",
    MISSING: "warning",
    UNKNOWN: "neutral",
  };

export function InboxesContent(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [dnsChecks, setDnsChecks] = useState<DnsCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectors, setSelectors] = useState<Record<string, string>>({});

  const [signatureInboxId, setSignatureInboxId] = useState<string>("");
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [newSignatureLabel, setNewSignatureLabel] = useState("");
  const [newSignatureContent, setNewSignatureContent] = useState("");
  const [savingSignature, setSavingSignature] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/inboxes`);
    if (response.ok) {
      const data = await response.json();
      setInboxes(data.inboxes);
      setDnsChecks(data.dnsChecks);
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!signatureInboxId && inboxes.length > 0) setSignatureInboxId(inboxes[0]!.id);
  }, [inboxes, signatureInboxId]);

  const loadSignatures = useCallback(async () => {
    if (!signatureInboxId) {
      setSignatures([]);
      return;
    }
    const response = await fetch(
      `/api/organisations/${organisationId}/inboxes/${signatureInboxId}/signatures`,
    );
    if (response.ok) setSignatures((await response.json()).signatures);
  }, [organisationId, signatureInboxId]);

  useEffect(() => {
    void loadSignatures();
  }, [loadSignatures]);

  useEffect(() => {
    const status = searchParams.get("gmailOAuth");
    if (status === "connected") {
      toast.show("Gmail inbox connected", "success");
    } else if (status === "error") {
      toast.show(searchParams.get("message") ?? "Could not connect Gmail inbox", "error");
    }
  }, [searchParams, toast]);

  async function handleDisconnect(inboxId: string) {
    const response = await fetch(`/api/organisations/${organisationId}/inboxes/${inboxId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      await load();
    } else {
      toast.show("Could not disconnect inbox", "error");
    }
  }

  async function handleUpdateLimit(inboxId: string, dailySendLimit: number) {
    const response = await fetch(`/api/organisations/${organisationId}/inboxes/${inboxId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailySendLimit }),
    });
    if (response.ok) {
      await load();
    } else {
      toast.show("Could not update daily send limit", "error");
    }
  }

  async function handleRecheck(domain: string) {
    const response = await fetch(`/api/organisations/${organisationId}/dns-checks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, dkimSelector: selectors[domain] || undefined }),
    });
    if (response.ok) {
      await load();
    } else {
      toast.show("Could not run DNS check", "error");
    }
  }

  async function handleAddSignature() {
    if (!signatureInboxId || !newSignatureLabel || !newSignatureContent) return;
    setSavingSignature(true);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/inboxes/${signatureInboxId}/signatures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: newSignatureLabel, content: newSignatureContent }),
        },
      );
      if (response.ok) {
        setNewSignatureLabel("");
        setNewSignatureContent("");
        await loadSignatures();
      } else {
        toast.show("Could not save signature", "error");
      }
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleSetDefaultSignature(signatureId: string) {
    const response = await fetch(
      `/api/organisations/${organisationId}/inboxes/${signatureInboxId}/signatures/${signatureId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      },
    );
    if (response.ok) await loadSignatures();
    else toast.show("Could not set default signature", "error");
  }

  async function handleDeleteSignature(signatureId: string) {
    const response = await fetch(
      `/api/organisations/${organisationId}/inboxes/${signatureInboxId}/signatures/${signatureId}`,
      { method: "DELETE" },
    );
    if (response.ok) await loadSignatures();
    else toast.show("Could not delete signature", "error");
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Inboxes"
        description="Connect Gmail sending mailboxes and check their deliverability DNS records."
        actions={
          <Button
            onClick={() => {
              window.location.href = `/api/gmail/oauth/start?organisationId=${organisationId}`;
            }}
          >
            Connect Gmail inbox
          </Button>
        }
      />

      <Card>
        {loading ? null : inboxes.length === 0 ? (
          <EmptyState
            icon={<Mails />}
            title="No inboxes connected"
            description="Connect a Gmail account to send campaigns from."
          />
        ) : (
          <Table
            columns={[
              { key: "email", header: "Inbox", render: (inbox: Inbox) => inbox.emailAddress },
              {
                key: "status",
                header: "Status",
                render: (inbox: Inbox) => (
                  <Badge tone={INBOX_STATUS_TONE[inbox.status]}>
                    {inbox.status.replace("_", " ")}
                  </Badge>
                ),
              },
              {
                key: "limit",
                header: "Daily send limit",
                render: (inbox: Inbox) => (
                  <input
                    type="number"
                    min={1}
                    max={500}
                    defaultValue={inbox.dailySendLimit}
                    className="w-20 rounded-md-sm border border-outline/40 bg-transparent px-2 py-1 text-sm"
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value && value !== inbox.dailySendLimit)
                        void handleUpdateLimit(inbox.id, value);
                    }}
                  />
                ),
              },
              {
                key: "actions",
                header: "",
                render: (inbox: Inbox) => (
                  <Button variant="text" onClick={() => handleDisconnect(inbox.id)}>
                    Disconnect
                  </Button>
                ),
              },
            ]}
            rows={inboxes}
            getRowKey={(inbox) => inbox.id}
          />
        )}
      </Card>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-on-surface-variant">Domain deliverability</h3>
        {dnsChecks.length === 0 ? (
          <EmptyState
            title="No domains checked yet"
            description="Connect an inbox to automatically run its first DNS check."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {dnsChecks.map((check) => (
              <li key={check.id} className="rounded-md-md border border-outline/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-on-surface">{check.domain}</p>
                  <div className="flex items-center gap-2">
                    <Badge tone={DNS_STATUS_TONE[check.spfStatus]}>SPF {check.spfStatus}</Badge>
                    <Badge tone={DNS_STATUS_TONE[check.dkimStatus]}>DKIM {check.dkimStatus}</Badge>
                    <Badge tone={DNS_STATUS_TONE[check.dmarcStatus]}>
                      DMARC {check.dmarcStatus}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <TextInput
                    label="DKIM selector"
                    placeholder="e.g. google"
                    defaultValue={check.dkimSelector ?? ""}
                    onChange={(event) =>
                      setSelectors((prev) => ({ ...prev, [check.domain]: event.target.value }))
                    }
                  />
                  <Button variant="outlined" onClick={() => handleRecheck(check.domain)}>
                    Recheck
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <h3 className="mb-4 text-sm font-medium text-on-surface-variant">Signatures</h3>
        {inboxes.length === 0 ? (
          <EmptyState
            title="No inboxes connected"
            description="Connect an inbox first to add signatures for it."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              label="Inbox"
              value={signatureInboxId}
              options={inboxes.map((inbox) => ({ value: inbox.id, label: inbox.emailAddress }))}
              onChange={(event) => setSignatureInboxId(event.target.value)}
            />

            {signatures.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {signatures.map((signature) => (
                  <li key={signature.id} className="rounded-md-md border border-outline/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-on-surface">{signature.label}</p>
                        {signature.isDefault ? <Badge tone="success">Default</Badge> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {!signature.isDefault ? (
                          <Button
                            variant="text"
                            onClick={() => handleSetDefaultSignature(signature.id)}
                          >
                            Set default
                          </Button>
                        ) : null}
                        <Button variant="text" onClick={() => handleDeleteSignature(signature.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-on-surface-variant">
                      {signature.content}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No signatures yet"
                description="Add one below — the default signature is appended to every AI-generated email sent from this inbox."
              />
            )}

            <div className="flex flex-col gap-3 border-t border-outline/15 pt-4">
              <TextInput
                label="Label"
                placeholder="e.g. Default, Formal"
                value={newSignatureLabel}
                onChange={(event) => setNewSignatureLabel(event.target.value)}
              />
              <TextArea
                label="Signature text"
                placeholder={"Best,\nAlex Rivera\nHead of Sales, Acme Inc"}
                value={newSignatureContent}
                onChange={(event) => setNewSignatureContent(event.target.value)}
              />
              <Button
                loading={savingSignature}
                disabled={!newSignatureLabel || !newSignatureContent}
                onClick={handleAddSignature}
              >
                Add signature
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
