"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, ToastProvider, type LinkComponentProps } from "@mail-orbyt/design-system";
import { signOutAction } from "./actions";

function NextLink({ href, className, children }: LinkComponentProps): React.ReactElement {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export interface AppShellClientProps {
  organisations: { id: string; name: string }[];
  activeOrganisationId: string;
  user: { name: string; email: string };
  children: React.ReactNode;
}

export function AppShellClient({
  organisations,
  activeOrganisationId,
  user,
  children,
}: AppShellClientProps): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const activeNavKey = pathname.split("/").filter(Boolean)[0] ?? "overview";

  async function handleSwitchOrganisation(organisationId: string) {
    const response = await fetch("/api/organisations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisationId }),
    });
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <ToastProvider>
      <AppShell
        activeNavKey={activeNavKey}
        organisations={organisations}
        activeOrganisationId={activeOrganisationId}
        onSwitchOrganisation={handleSwitchOrganisation}
        user={user}
        onProfile={() => router.push("/settings/members")}
        onSignOut={() => void signOutAction()}
        notifications={[]}
        onOpenNotification={() => {}}
        LinkComponent={NextLink}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
