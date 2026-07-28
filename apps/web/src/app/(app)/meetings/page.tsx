"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Card,
  Checkbox,
  EmptyState,
  PageHeader,
  Select,
  useToast,
} from "@mail-orbyt/design-system";
import { CalendarCheck } from "lucide-react";
import { useOrganisation } from "../organisation-context";

interface Meeting {
  id: string;
  status: "SCHEDULED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  qualified: boolean;
  bookedAt: string;
  notes: string | null;
  lead: { firstName: string | null; lastName: string | null; email: string | null };
}

const STATUS_TONE: Record<Meeting["status"], "neutral" | "success" | "warning" | "error"> = {
  SCHEDULED: "neutral",
  COMPLETED: "success",
  NO_SHOW: "warning",
  CANCELLED: "error",
};

export default function MeetingsPage(): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/organisations/${organisationId}/meetings`);
    if (response.ok) {
      const data = await response.json();
      setMeetings(data.meetings);
    }
    setLoading(false);
  }, [organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpdate(
    meetingId: string,
    patch: Partial<Pick<Meeting, "status" | "qualified">>,
  ) {
    const response = await fetch(`/api/organisations/${organisationId}/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) {
      await load();
    } else {
      toast.show("Could not update meeting", "error");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Meetings"
        description="Meetings are logged manually (no calendar integration). Mark a meeting qualified once a human confirms it counts toward the qualified meeting rate."
      />

      <Card>
        {loading ? null : meetings.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck />}
            title="No meetings logged yet"
            description="Log a meeting from a lead's conversation once a call is booked."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {meetings.map((meeting) => (
              <li key={meeting.id} className="rounded-md-md border border-outline/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">
                      {[meeting.lead.firstName, meeting.lead.lastName].filter(Boolean).join(" ") ||
                        meeting.lead.email}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Booked {new Date(meeting.bookedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      label="Qualified"
                      checked={meeting.qualified}
                      onChange={(event) =>
                        handleUpdate(meeting.id, { qualified: event.target.checked })
                      }
                    />
                    <Select
                      label="Status"
                      hideLabel
                      value={meeting.status}
                      options={[
                        { value: "SCHEDULED", label: "Scheduled" },
                        { value: "COMPLETED", label: "Completed" },
                        { value: "NO_SHOW", label: "No-show" },
                        { value: "CANCELLED", label: "Cancelled" },
                      ]}
                      onChange={(event) =>
                        handleUpdate(meeting.id, {
                          status: event.target.value as Meeting["status"],
                        })
                      }
                    />
                    <Badge tone={STATUS_TONE[meeting.status]}>
                      {meeting.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
