import { hasPermission } from "@mail-orbyt/authentication";
import { PageHeader } from "@mail-orbyt/design-system";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { listOrganisationSignatures } from "@/lib/gmail";
import { SettingsNav } from "../settings-nav";
import { SignaturesClient } from "./signatures-client";

export default async function SignaturesPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const signatures = await listOrganisationSignatures(organisation.organisationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Signatures"
        description="Shared across every connected inbox — the default signature is appended to every AI-generated email, whichever inbox sends it."
      />
      <SettingsNav />
      <SignaturesClient
        organisationId={organisation.organisationId}
        canManage={hasPermission(organisation.role, "inboxes:manage")}
        initialSignatures={signatures}
      />
    </div>
  );
}
