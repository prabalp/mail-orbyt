import { Suspense } from "react";
import { Card, Skeleton } from "@mail-orbyt/design-system";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <Card>
          <Skeleton className="h-6 w-2/3" />
          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
