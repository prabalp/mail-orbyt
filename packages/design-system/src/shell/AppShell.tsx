import { useState, type ComponentType, type ReactNode } from "react";
import { Sidebar, type LinkComponentProps } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { OrgSwitcher, type OrgSwitcherOrganisation } from "./OrgSwitcher";
import { UserMenu } from "./UserMenu";
import { NotificationArea, type NotificationItem } from "./NotificationArea";
import { IconButton } from "../components/IconButton";

export interface AppShellProps {
  activeNavKey: string;
  organisations: OrgSwitcherOrganisation[];
  activeOrganisationId: string;
  onSwitchOrganisation: (organisationId: string) => void;
  onCreateOrganisation?: () => void;
  user: { name: string; email: string };
  onProfile: () => void;
  onSignOut: () => void;
  notifications: NotificationItem[];
  onOpenNotification: (id: string) => void;
  breadcrumbs?: ReactNode;
  children: ReactNode;
  LinkComponent?: ComponentType<LinkComponentProps>;
}

export function AppShell({
  activeNavKey,
  organisations,
  activeOrganisationId,
  onSwitchOrganisation,
  onCreateOrganisation,
  user,
  onProfile,
  onSignOut,
  notifications,
  onOpenNotification,
  breadcrumbs,
  children,
  LinkComponent,
}: AppShellProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        activeKey={activeNavKey}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
        LinkComponent={LinkComponent}
      />
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeKey={activeNavKey}
        LinkComponent={LinkComponent}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-outline/15 bg-surface px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <IconButton
              label="Open menu"
              icon={<span aria-hidden="true">☰</span>}
              className="md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            />
            <OrgSwitcher
              organisations={organisations}
              activeOrganisationId={activeOrganisationId}
              onSwitch={onSwitchOrganisation}
              onCreateOrganisation={onCreateOrganisation}
            />
          </div>
          <div className="flex items-center gap-2">
            <NotificationArea
              notifications={notifications}
              onOpenNotification={onOpenNotification}
            />
            <UserMenu
              name={user.name}
              email={user.email}
              onProfile={onProfile}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
          {breadcrumbs ? <div className="mb-4">{breadcrumbs}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
