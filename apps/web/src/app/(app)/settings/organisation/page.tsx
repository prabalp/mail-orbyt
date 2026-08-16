import { hasPermission } from "@mail-orbyt/authentication";
import { PageHeader } from "@mail-orbyt/design-system";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { SettingsNav } from "../settings-nav";
import { OrganisationClient } from "./organisation-client";

export default async function OrganisationSettingsPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organisation"
        description={`Settings for ${organisation.organisationName}.`}
      />
      <SettingsNav />
      <OrganisationClient
        organisationId={organisation.organisationId}
        organisationName={organisation.organisationName}
        canDelete={hasPermission(organisation.role, "organisation:delete")}
      />
    </div>
  );
}
