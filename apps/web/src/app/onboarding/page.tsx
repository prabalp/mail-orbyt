import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { OnboardingForm } from "./onboarding-form";

/**
 * Deliberately NOT nested under the (app) route group — that layout
 * redirects here whenever the signed-in user has no organisation yet, so
 * this page must not go through the same layout or it would redirect to
 * itself in an infinite loop.
 */
export default async function OnboardingPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id || session.error) {
    redirect("/sign-in");
  }

  const currentOrganisation = await getCurrentOrganisation(session.user.id);
  if (currentOrganisation) {
    redirect("/overview");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <OnboardingForm />
      </div>
    </div>
  );
}
