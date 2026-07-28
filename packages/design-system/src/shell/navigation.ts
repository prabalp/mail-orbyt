import {
  BarChart3,
  CalendarCheck,
  LayoutDashboard,
  Mails,
  MessageSquare,
  Search,
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
  { key: "research", label: "Research", href: "/research", icon: Search },
  { key: "campaigns", label: "Campaigns", href: "/campaigns", icon: Send },
  { key: "inboxes", label: "Inboxes", href: "/inboxes", icon: Mails },
  { key: "conversations", label: "Conversations", href: "/conversations", icon: MessageSquare },
  { key: "meetings", label: "Meetings", href: "/meetings", icon: CalendarCheck },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3 },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];
