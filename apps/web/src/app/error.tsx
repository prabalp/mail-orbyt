"use client";

import { Alert, Button, Card } from "@mail-orbyt/design-system";

/**
 * Segment-level error boundary. Paired with global-error.tsx (which only
 * catches errors thrown by the root layout itself) — see that file's
 * comment for why both exist: Next's build-time export of its internal
 * default /404 and /500 fallback pages fails in this project without a
 * custom error UI in place.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card>
        <h1 className="text-2xl font-semibold text-on-surface">Something went wrong</h1>
        <div className="mt-4">
          <Alert tone="error" title="Unexpected error">
            {error.message || "An unexpected error occurred. Please try again."}
          </Alert>
        </div>
        <div className="mt-6">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </Card>
    </div>
  );
}
