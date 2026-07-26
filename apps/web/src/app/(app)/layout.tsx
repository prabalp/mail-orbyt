import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { AppShellClient } from "./app-shell-client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.id || session.error) {
    redirect("/sign-in");
  }

  const currentOrganisation = await getCurrentOrganisation(session.user.id);

  if (!currentOrganisation) {
    redirect("/onboarding");
  }

  return (
    <AppShellClient
      organisations={currentOrganisation.memberships.map((m) => ({ id: m.id, name: m.name }))}
      activeOrganisationId={currentOrganisation.organisationId}
      user={{
        name: session.user.name ?? session.user.email ?? "Unknown",
        email: session.user.email ?? "",
      }}
    >
      {children}
    </AppShellClient>
  );
}
