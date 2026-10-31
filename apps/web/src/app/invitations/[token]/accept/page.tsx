import { redirect } from "next/navigation";

interface LegacyAcceptPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Invitation emails sent before the link fix pointed at
 * `/invitations/{token}/accept`, which had no page. Keep those links working.
 */
export default async function LegacyAcceptInvitationPage({
  params,
}: LegacyAcceptPageProps): Promise<never> {
  const { token } = await params;
  redirect(`/invitations/${encodeURIComponent(token)}`);
}
