import { Card } from "@mail-orbyt/design-system";
import { auth } from "@/lib/auth";
import { AcceptInvitationForm } from "./accept-form";

interface InvitationPageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({
  params,
}: InvitationPageProps): Promise<React.ReactElement> {
  const { token } = await params;
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <Card>
          <h1 className="text-2xl font-semibold text-on-surface">You&apos;ve been invited</h1>
          {session?.user?.id ? (
            <>
              <p className="mt-2 text-sm text-on-surface-variant">
                Signed in as {session.user.email}. Accept to join the organisation.
              </p>
              <div className="mt-6">
                <AcceptInvitationForm token={token} />
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-on-surface-variant">
                Sign in or create an account with the email this invitation was sent to, then come
                back to this link to accept.
              </p>
              <a
                href={`/sign-in?callbackUrl=${encodeURIComponent(`/invitations/${token}`)}`}
                className="mt-6 inline-block text-sm text-primary hover:underline"
              >
                Sign in to accept
              </a>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
