import { loadEnv } from "@mail-orbyt/config";
import { prisma } from "@mail-orbyt/database";
import { Card } from "@mail-orbyt/design-system";
import { isSuppressed } from "@mail-orbyt/leads";
import { verifyUnsubscribeToken } from "@mail-orbyt/scheduling";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

interface UnsubscribePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}

/**
 * Public confirmation page. Opening the link never unsubscribes anyone by
 * itself (mail scanners prefetch links); the button POSTs to the API route.
 */
export default async function UnsubscribePage({
  params,
  searchParams,
}: UnsubscribePageProps): Promise<React.ReactElement> {
  const { token } = await params;
  const { done } = await searchParams;
  const payload = verifyUnsubscribeToken(loadEnv().AUTH_SECRET, token);
  const unsubscribed = payload
    ? done === "1" || (await isSuppressed(prisma, payload.organisationId, payload.email))
    : false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <Card>
          {!payload ? (
            <>
              <h1 className="text-2xl font-semibold text-on-surface">Link not valid</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                This unsubscribe link is incomplete or has been changed. Reply to the email and ask
                to be removed, and we will stop.
              </p>
            </>
          ) : unsubscribed ? (
            <>
              <h1 className="text-2xl font-semibold text-on-surface">You&apos;re unsubscribed</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                {payload.email} won&apos;t receive any more emails from us.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-on-surface">Unsubscribe</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Stop emails to {payload.email}? You won&apos;t hear from us again.
              </p>
              <form method="post" action={`/api/unsubscribe/${token}`} className="mt-6">
                <input type="hidden" name="source" value="page" />
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary"
                >
                  Unsubscribe
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
