import { EmptyState, PageHeader } from "@mail-orbyt/design-system";
import { Construction } from "lucide-react";

/**
 * Honest "not built yet" page for nav destinations whose functionality
 * lands in a later phase — avoids a dead link/404 without pretending the
 * feature exists. Replaced by the real page as each phase implements it.
 */
export function ComingSoon({ title, phase }: { title: string; phase: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState
        icon={<Construction />}
        title={`${title} lands in ${phase}`}
        description="This part of the product hasn't been built yet."
      />
    </div>
  );
}
