"use client";

/**
 * Without this, Next.js falls back to synthesizing its default error UI
 * through internal pages-router machinery even in an app-router-only
 * project — and that fallback fails to prerender in this Next/React
 * version combination (`<Html> should not be imported outside of
 * pages/_document`), taking the whole production build down with it. A
 * custom global-error page sidesteps that fallback entirely. Must render
 * its own <html>/<body> since it replaces the root layout on error.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }): React.ReactElement {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ marginTop: 8, color: "#666" }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 24, padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
