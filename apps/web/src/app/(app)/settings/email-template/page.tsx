import { hasPermission } from "@mail-orbyt/authentication";
import { prisma } from "@mail-orbyt/database";
import { PageHeader } from "@mail-orbyt/design-system";
import {
  DEFAULT_CAMPAIGN_EMAIL_PROMPT,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_REVIEW_SYSTEM_PROMPT,
} from "@mail-orbyt/email-generation";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrganisation } from "@/lib/current-organisation";
import { SettingsNav } from "../settings-nav";
import { EmailTemplateClient } from "./email-template-client";

export default async function EmailTemplatePage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const organisation = await getCurrentOrganisation(session.user.id);
  if (!organisation) redirect("/onboarding");

  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: organisation.organisationId },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Email template"
        description="Set the default campaign prompt AI-generated emails follow, and embed a booking link in every one."
      />
      <SettingsNav />
      <EmailTemplateClient
        organisationId={organisation.organisationId}
        canManage={hasPermission(organisation.role, "campaigns:manage")}
        emailPromptInstructions={org.emailPromptInstructions ?? DEFAULT_CAMPAIGN_EMAIL_PROMPT}
        calendlyUrl={org.calendlyUrl ?? ""}
        generationSystemPrompt={org.generationSystemPrompt ?? DEFAULT_GENERATION_SYSTEM_PROMPT}
        reviewSystemPrompt={org.reviewSystemPrompt ?? DEFAULT_REVIEW_SYSTEM_PROMPT}
        defaultGenerationSystemPrompt={DEFAULT_GENERATION_SYSTEM_PROMPT}
        defaultReviewSystemPrompt={DEFAULT_REVIEW_SYSTEM_PROMPT}
      />
    </div>
  );
}
