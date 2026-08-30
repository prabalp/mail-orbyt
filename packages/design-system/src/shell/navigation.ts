import {
  LayoutDashboard,
  Mails,
  MessageSquare,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Primary navigation items, shared between the sidebar and mobile drawer. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "/overview", icon: LayoutDashboard },
  { key: "leads", label: "Leads", href: "/leads", icon: Users },
  { key: "inboxes", label: "Inboxes", href: "/inboxes", icon: Mails },
  { key: "campaigns", label: "Campaigns", href: "/campaigns", icon: Send },
  { key: "conversations", label: "Conversations", href: "/conversations", icon: MessageSquare },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];
