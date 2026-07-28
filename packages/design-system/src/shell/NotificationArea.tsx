import { Bell } from "lucide-react";
import { DropdownMenu } from "../components/DropdownMenu";
import { Badge } from "../components/Badge";

export interface NotificationItem {
  id: string;
  message: string;
  read: boolean;
  href?: string;
}

export interface NotificationAreaProps {
  notifications: NotificationItem[];
  onOpenNotification: (id: string) => void;
}

export function NotificationArea({
  notifications,
  onOpenNotification,
}: NotificationAreaProps): React.ReactElement {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu
      align="end"
      trigger={
        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-on-surface/8">
          <Bell size={18} aria-hidden="true" />
          <span className="sr-only">
            Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
          </span>
          {unreadCount > 0 ? (
            <span className="absolute right-0.5 top-0.5">
              <Badge tone="error">{unreadCount}</Badge>
            </span>
          ) : null}
        </span>
      }
      items={
        notifications.length > 0
          ? notifications.map((notification) => ({
              key: notification.id,
              label: notification.message,
              onSelect: () => onOpenNotification(notification.id),
            }))
          : [{ key: "empty", label: "No notifications", onSelect: () => {}, disabled: true }]
      }
    />
  );
}
