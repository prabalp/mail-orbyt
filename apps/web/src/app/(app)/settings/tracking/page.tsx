import { hasPermission } from "@mail-orbyt/authentication";
import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { PageHeader } from "@mail-orbyt/design-system";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { SettingsNav } from "../settings-nav";
import { TrackingDomainClient } from "./tracking-domain-client";

export default async function TrackingPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const trackingDomain = await prisma.trackingDomain.findUnique({
    where: { organisationId: organisation.organisationId },
  });
  const env = loadEnv();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tracking"
        description="Verify a domain you own to serve email-open tracking pixels under your own reputation, never a shared Orbyt-branded host."
      />
      <SettingsNav />
      <TrackingDomainClient
        organisationId={organisation.organisationId}
        canManage={hasPermission(organisation.role, "inboxes:manage")}
        trackingDomain={trackingDomain}
        cnameTarget={env.TRACKING_CNAME_TARGET ?? null}
        verificationTxtName={trackingDomain ? `_mail-orbyt-verify.${trackingDomain.domain}` : null}
      />
    </div>
  );
}
