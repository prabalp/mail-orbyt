import { Suspense } from "react";
import { Skeleton } from "@mail-orbyt/design-system";
import { InboxesContent } from "./inboxes-content";

export default function InboxesPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <InboxesContent />
    </Suspense>
  );
}
