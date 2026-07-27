"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, EmptyState, PageHeader } from "@mail-orbyt/design-system";
import { useOrganisation } from "../organisation-context";

interface ConversationMessage {
  id: string;
  direction: "OUTBOUND" | "INBOUND";
  classification: string | null;
  snippet: string | null;
  occurredAt: string;
}

interface Conversation {
  id: string;
  subject: string | null;
  status: "OPEN" | "CLOSED";
  lastMessageAt: string;
  lead: { firstName: string | null; lastName: string | null; email: string | null };
  messages: ConversationMessage[];
}

const CLASSIFICATION_TONE: Record<string, "success" | "error" | "warning" | "neutral"> = {
  INTERESTED: "success",
  NOT_INTERESTED: "error",
  UNSUBSCRIBE_REQUEST: "error",
  BOUNCE: "error",
  OUT_OF_OFFICE: "warning",
  UNCLASSIFIED: "neutral",
};

export default function ConversationsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/conversations`);
    if (response.ok) {
      const data = await response.json();
      setConversations(data.conversations);
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Conversations"
        description="Replies from leads. Replying to any campaign step always pauses further automated sends for that lead."
      />

      <Card>
        {loading ? null : conversations.length === 0 ? (
          <EmptyState
            title="No replies yet"
            description="Replies detected from connected inboxes will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {conversations.map((conversation) => {
              const latest = conversation.messages[0];
              return (
                <li key={conversation.id} className="rounded-md-md border border-outline/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        {[conversation.lead.firstName, conversation.lead.lastName]
                          .filter(Boolean)
                          .join(" ") || conversation.lead.email}
                      </p>
                      <p className="text-xs text-on-surface-variant">{conversation.subject}</p>
                      {latest ? (
                        <p className="mt-1 text-sm text-on-surface-variant">{latest.snippet}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {latest?.classification ? (
                        <Badge tone={CLASSIFICATION_TONE[latest.classification] ?? "neutral"}>
                          {latest.classification.replace(/_/g, " ")}
                        </Badge>
                      ) : null}
                      <Badge tone={conversation.status === "OPEN" ? "neutral" : "success"}>
                        {conversation.status}
                      </Badge>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
