import type { ComponentType } from "react";
import { cn } from "../cn";
import { Drawer } from "../components/Drawer";
import { NAV_ITEMS } from "./navigation";
import type { LinkComponentProps } from "./Sidebar";

export interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  activeKey: string;
  LinkComponent?: ComponentType<LinkComponentProps> | undefined;
}

function DefaultLink({ href, className, children }: LinkComponentProps): React.ReactElement {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function MobileDrawer({
  open,
  onClose,
  activeKey,
  LinkComponent = DefaultLink,
}: MobileDrawerProps): React.ReactElement | null {
  return (
    <Drawer open={open} onClose={onClose} title="Menu" side="left">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <LinkComponent
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md-md px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-on-surface/8",
                )}
              >
                <Icon size={20} className="shrink-0" aria-hidden="true" />
                {item.label}
              </LinkComponent>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
