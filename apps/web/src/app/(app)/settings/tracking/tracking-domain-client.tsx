"use client";

import { useState } from "react";
import type { TrackingDomain } from "@mail-orbyt/database";
import { Alert, Badge, Button, Card, TextInput, useToast } from "@mail-orbyt/design-system";

export interface TrackingDomainClientProps {
  organisationId: string;
  canManage: boolean;
  trackingDomain: TrackingDomain | null;
  cnameTarget: string | null;
  verificationTxtName: string | null;
}

const STATUS_TONE: Record<TrackingDomain["status"], "success" | "error" | "warning" | "neutral"> = {
  VERIFIED: "success",
  FAILED: "error",
  PENDING: "warning",
};

export function TrackingDomainClient({
  organisationId,
  canManage,
  trackingDomain: initialTrackingDomain,
  cnameTarget,
  verificationTxtName: initialTxtName,
}: TrackingDomainClientProps): React.ReactElement {
  const toast = useToast();
  const [domain, setDomain] = useState(initialTrackingDomain?.domain ?? "");
  const [trackingDomain, setTrackingDomain] = useState(initialTrackingDomain);
  const [txtName, setTxtName] = useState(initialTxtName);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/settings/tracking-domain`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        trackingDomain?: TrackingDomain;
        error?: unknown;
      } | null;
      if (response.ok && body?.trackingDomain) {
        setTrackingDomain(body.trackingDomain);
        setTxtName(`_mail-orbyt-verify.${body.trackingDomain.domain}`);
        toast.show("Tracking domain saved: add the DNS records below, then verify.", "success");
      } else {
        setError(typeof body?.error === "string" ? body.error : "Couldn't save this domain.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/settings/tracking-domain/verify`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        trackingDomain?: TrackingDomain;
        error?: string;
      } | null;
      if (response.ok && body?.trackingDomain) {
        setTrackingDomain(body.trackingDomain);
        toast.show(
          body.trackingDomain.status === "VERIFIED"
            ? "Domain verified: new campaign emails will include the tracking pixel."
            : "Verification failed: DNS records may still be propagating.",
          body.trackingDomain.status === "VERIFIED" ? "success" : "error",
        );
      } else {
        setError(body?.error ?? "Couldn't verify this domain.");
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="error" title="Couldn't complete that">
            {error}
          </Alert>
        ) : null}

        {!cnameTarget ? (
          <Alert tone="warning" title="Not configured on this deployment">
            Tracking domains aren&apos;t available yet: an operator needs to set{" "}
            <code>TRACKING_CNAME_TARGET</code> and <code>INTERNAL_ASK_SECRET</code>.
          </Alert>
        ) : null}

        <TextInput
          label="Tracking domain"
          helperText="A subdomain you own and control, dedicated to this (e.g. track.yourcompany.com). Never your primary sending domain."
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={!canManage || !cnameTarget}
          placeholder="track.yourcompany.com"
        />

        {canManage && cnameTarget ? (
          <div>
            <Button onClick={handleSave} loading={saving} disabled={!domain}>
              Save domain
            </Button>
          </div>
        ) : null}

        {trackingDomain ? (
          <div className="flex flex-col gap-3 border-t border-outline/20 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-on-surface-variant">Status</span>
              <Badge tone={STATUS_TONE[trackingDomain.status]}>{trackingDomain.status}</Badge>
            </div>

            <p className="text-xs text-on-surface-variant">
              Add these two DNS records at your registrar, then click Verify. The CNAME is what
              routes pixel traffic to us; the TXT record proves you own the domain before we ever
              issue a certificate for it.
            </p>

            <div className="overflow-x-auto rounded-md border border-outline/30">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-outline/20 text-left text-on-surface-variant">
                    <th className="p-2">Type</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-outline/10">
                    <td className="p-2 font-mono">CNAME</td>
                    <td className="p-2 font-mono">{trackingDomain.domain}</td>
                    <td className="p-2 font-mono">{cnameTarget}</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">TXT</td>
                    <td className="p-2 font-mono">{txtName}</td>
                    <td className="p-2 font-mono">{trackingDomain.verificationToken}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {canManage ? (
              <div>
                <Button variant="outlined" onClick={handleVerify} loading={verifying}>
                  Verify
                </Button>
              </div>
            ) : null}

            {trackingDomain.status === "VERIFIED" ? (
              <p className="text-xs text-on-surface-variant">
                Heads up: Apple Mail Privacy Protection and Gmail&apos;s image proxy pre-load this
                pixel for most recipients regardless of whether they actually opened the email, so
                open counts will read higher than true opens; this is true of pixel tracking
                everywhere, not specific to this setup.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
