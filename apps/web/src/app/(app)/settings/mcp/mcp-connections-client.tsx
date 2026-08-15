"use client";

import { useState } from "react";
import { Button, Card, EmptyState, useToast } from "@mail-orbyt/design-system";

export interface McpConnectionSummaryProps {
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: string;
}

export interface McpConnectionsClientProps {
  organisationId: string;
  connections: McpConnectionSummaryProps[];
}

export function McpConnectionsClient({
  organisationId,
  connections: initialConnections,
}: McpConnectionsClientProps): React.ReactElement {
  const toast = useToast();
  const [connections, setConnections] = useState(initialConnections);
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);

  async function handleRevoke(clientId: string) {
    setRevokingClientId(clientId);
    try {
      const response = await fetch(
        `/api/organisations/${organisationId}/settings/mcp-connections`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        },
      );
      if (response.ok) {
        setConnections((current) => current.filter((c) => c.clientId !== clientId));
        toast.show("Connection revoked", "success");
      } else {
        toast.show("Couldn't revoke this connection.", "error");
      }
    } finally {
      setRevokingClientId(null);
    }
  }

  if (connections.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No connections yet"
          description="When you connect an application like Claude via MCP, it will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {connections.map((connection) => (
        <Card key={connection.clientId}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-on-surface">{connection.clientName}</h3>
              <p className="text-xs text-on-surface-variant">
                Connected {new Date(connection.createdAt).toLocaleDateString()} · Scope:{" "}
                {connection.scope || "profile"}
              </p>
            </div>
            <Button
              variant="outlined"
              onClick={() => handleRevoke(connection.clientId)}
              loading={revokingClientId === connection.clientId}
            >
              Revoke
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
