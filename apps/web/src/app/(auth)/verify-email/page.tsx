import { Alert, Card } from "@mail-orbyt/design-system";
import { VerifyEmailForm } from "./verify-form";

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps): Promise<React.ReactElement> {
  const { token } = await searchParams;

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-on-surface">Verify your email</h1>
      <div className="mt-4">
        {token ? (
          <VerifyEmailForm token={token} />
        ) : (
          <Alert tone="error" title="Missing verification token">
            This link is missing its verification token.
          </Alert>
        )}
      </div>
    </Card>
  );
}
