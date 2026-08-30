"use client";

import { useState } from "react";
import { Alert, Button, Card, RadioGroup } from "@mail-orbyt/design-system";
import { approveAuthorization, denyAuthorization } from "./actions";

const SCOPE_LABELS: Record<string, string> = {
  profile: "View your basic account and organisation membership",
  "leads:manage": "Manage leads (import, export, archive, delete)",
  "campaigns:manage": "Manage campaigns, sequences, and email drafts",
  "research:review": "Run and review prospect/company research",
  "conversations:review": "View and manage conversations, replies, and meetings",
  "analytics:view": "View analytics and reporting",
  "inboxes:manage": "Manage connected sending inboxes and signatures",
  "members:manage": "Manage organisation members and invitations",
  "organisation:delete": "Delete the organisation",
  "organisation:transfer_ownership": "Transfer organisation ownership",
  "billing:manage": "Manage billing",
};

export interface AuthorizeClientProps {
  clientId: string;
  clientName: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  organisations: { id: string; name: string; role: string }[];
}

export function AuthorizeClient({
  clientId,
  clientName,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod,
  organisations,
}: AuthorizeClientProps): React.ReactElement {
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "");
  const requestedScopes = scope.split(" ").filter(Boolean);

  return (
    <Card>
      <h1 className="text-xl font-semibold text-on-surface">Connect {clientName}</h1>
      <p className="mt-1 text-sm text-on-surface-variant">
        {clientName} wants to access Mail Orbyt on your behalf. You can revoke this at any time from
        Settings &rarr; MCP connections.
      </p>

      <div className="mt-4">
        <h2 className="text-sm font-medium text-on-surface">This will allow it to:</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-on-surface-variant">
          {requestedScopes.length === 0 ? (
            <li>View your basic account and organisation membership</li>
          ) : (
            requestedScopes.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? s}</li>)
          )}
        </ul>
      </div>

      {organisations.length > 1 ? (
        <div className="mt-4">
          <RadioGroup
            name="organisationPicker"
            label="Organisation"
            value={organisationId}
            onChange={setOrganisationId}
            options={organisations.map((org) => ({
              value: org.id,
              label: `${org.name} (${org.role})`,
            }))}
          />
        </div>
      ) : (
        <Alert tone="info" title={organisations[0]?.name ?? "Organisation"} className="mt-4">
          Access will be granted for this organisation only.
        </Alert>
      )}

      <div className="mt-6 flex gap-2">
        <form action={approveAuthorization}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="redirectUri" value={redirectUri} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="codeChallenge" value={codeChallenge} />
          <input type="hidden" name="codeChallengeMethod" value={codeChallengeMethod} />
          <input type="hidden" name="organisationId" value={organisationId} />
          <Button type="submit">Allow</Button>
        </form>
        <form action={denyAuthorization}>
          <input type="hidden" name="redirectUri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <Button type="submit" variant="outlined">
            Deny
          </Button>
        </form>
      </div>
    </Card>
  );
}
