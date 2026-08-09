import { maskSecret, resolveOrgAiConfig } from "@mail-orbyt/ai-settings";
import { hasPermission } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { PageHeader } from "@mail-orbyt/design-system";
import { getEnvironmentAiDefaults } from "@mail-orbyt/email-generation";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { SettingsNav } from "../settings-nav";
import { AiProviderClient } from "./ai-provider-client";

export default async function AiProviderPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const environment = getEnvironmentAiDefaults();
  const config = await resolveOrgAiConfig(prisma, organisation.organisationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI provider"
        description="Use your own Gemini API key and model instead of this deployment's defaults."
      />
      <SettingsNav />
      <AiProviderClient
        organisationId={organisation.organisationId}
        canManage={hasPermission(organisation.role, "campaigns:manage")}
        // Only ever a masked hint — the decrypted key stays on the server.
        apiKeyHint={config.apiKey ? maskSecret(config.apiKey) : null}
        keyDecryptionFailed={config.decryptionFailed ?? false}
        model={config.model ?? null}
        environmentKeyAvailable={environment.keyAvailable}
        environmentModel={environment.model}
      />
    </div>
  );
}
