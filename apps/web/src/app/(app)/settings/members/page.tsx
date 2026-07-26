import { hasPermission } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { PageHeader } from "@mail-orbyt/design-system";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { MembersClient } from "./members-client";

export default async function MembersPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const [memberships, invitations] = await Promise.all([
    prisma.organisationMembership.findMany({
      where: { organisationId: organisation.organisationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organisationId: organisation.organisationId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        description={`Manage who has access to ${organisation.organisationName}.`}
      />
      <MembersClient
        organisationId={organisation.organisationId}
        currentUserId={session.user.id}
        canManageMembers={hasPermission(organisation.role, "members:manage")}
        members={memberships.map((m) => ({
          userId: m.userId,
          name: m.user.name ?? m.user.email,
          email: m.user.email,
          role: m.role,
        }))}
        pendingInvitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
