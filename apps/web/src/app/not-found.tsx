import Link from "next/link";
import { Button, Card } from "@mail-orbyt/design-system";

/**
 * Without this, Next.js falls back to synthesizing its default 404 through
 * internal pages-router machinery even in an app-router-only project — and
 * that fallback fails to prerender in this Next/React version combination
 * (`<Html> should not be imported outside of pages/_document`), taking the
 * whole production build down with it. A custom not-found page sidesteps
 * that fallback entirely.
 */
export default function NotFound(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card>
        <h1 className="text-2xl font-semibold text-on-surface">Page not found</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6">
          <Link href="/">
            <Button>Back to Mail Orbyt</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
