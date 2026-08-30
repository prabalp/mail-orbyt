"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@mail-orbyt/design-system";

const SETTINGS_LINKS = [
  { href: "/settings/members", label: "Members" },
  { href: "/settings/email-template", label: "Email template" },
  { href: "/settings/signatures", label: "Signatures" },
  { href: "/settings/tracking", label: "Tracking" },
  { href: "/settings/ai-provider", label: "AI provider" },
  { href: "/settings/mcp", label: "MCP connections" },
  { href: "/settings/organisation", label: "Organisation" },
];

export function SettingsNav(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b border-outline/20">
      {SETTINGS_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "border-b-2 pb-2 text-sm font-medium",
            pathname === link.href
              ? "border-primary text-on-surface"
              : "border-transparent text-on-surface-variant hover:text-on-surface",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
