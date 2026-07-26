export interface NavItem {
  key: string;
  label: string;
  href: string;
}

/** Primary navigation items, shared between the sidebar and mobile drawer. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", href: "/overview" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "research", label: "Research", href: "/research" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
  { key: "inboxes", label: "Inboxes", href: "/inboxes" },
  { key: "conversations", label: "Conversations", href: "/conversations" },
  { key: "meetings", label: "Meetings", href: "/meetings" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
  { key: "settings", label: "Settings", href: "/settings" },
];
