import { EmptyState, PageHeader } from "@mail-orbyt/design-system";
import { LayoutDashboard } from "lucide-react";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";

export default async function OverviewPage(): Promise<React.ReactElement> {
  const session = await auth();
  const organisation = session?.user?.id ? await getCurrentOrganisation(session.user.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={
          organisation ? `${organisation.organisationName} · ${organisation.role}` : undefined
        }
      />
      <EmptyState
        icon={<LayoutDashboard />}
        title="Nothing to show yet"
        description="Import leads and launch your first campaign to see qualified meeting rate, delivery, and reply metrics here."
      />
    </div>
  );
}
