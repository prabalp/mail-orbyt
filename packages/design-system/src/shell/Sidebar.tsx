import type { ComponentType, ReactNode } from "react";
import { cn } from "../cn";
import { NAV_ITEMS } from "./navigation";

export interface LinkComponentProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export interface SidebarProps {
  activeKey: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Injected so this package never depends on Next.js's <Link>. */
  LinkComponent?: ComponentType<LinkComponentProps> | undefined;
}

function DefaultLink({ href, className, children }: LinkComponentProps): React.ReactElement {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Sidebar({
  activeKey,
  collapsed,
  onToggleCollapsed,
  LinkComponent = DefaultLink,
}: SidebarProps): React.ReactElement {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "hidden h-full flex-col border-r border-outline/20 bg-surface-container transition-all md:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="text-lg font-semibold text-on-surface">Mail Orbyt</span>}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-full p-2 text-on-surface-variant hover:bg-on-surface/8"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <ul className="flex flex-1 flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <li key={item.key}>
              <LinkComponent
                href={item.href}
                className={cn(
                  "flex items-center rounded-md-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-on-surface/8",
                  collapsed && "justify-center px-0",
                )}
              >
                <span aria-current={isActive ? "page" : undefined}>
                  {collapsed ? item.label.slice(0, 1) : item.label}
                </span>
              </LinkComponent>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
