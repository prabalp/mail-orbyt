import type { Config } from "tailwindcss";

/**
 * Composes a Tailwind color from an "R G B" CSS variable using the
 * `<alpha-value>` placeholder, so `bg-x`, `bg-x/50`, `border-x/30`, etc. all
 * work. tokens.css stores the raw channel triples (--md-x-rgb); plain
 * `var(--md-x)` hex/rgb() strings can't have a Tailwind-generated alpha
 * channel composed onto them, which is why this indirection exists.
 */
function withAlpha(cssVariable: string): string {
  return `rgb(var(${cssVariable}) / <alpha-value>)`;
}

/**
 * Shared Tailwind preset mapping Material 3 semantic tokens (see tokens.css)
 * onto Tailwind color/radius utilities, so components can write
 * `bg-primary` / `text-on-surface` / `rounded-md-md` instead of raw hex.
 */
export const designSystemPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        primary: withAlpha("--md-primary-rgb"),
        "on-primary": withAlpha("--md-on-primary-rgb"),
        "primary-container": withAlpha("--md-primary-container-rgb"),
        "on-primary-container": withAlpha("--md-on-primary-container-rgb"),
        surface: withAlpha("--md-surface-rgb"),
        "surface-container": withAlpha("--md-surface-container-rgb"),
        "surface-container-high": withAlpha("--md-surface-container-high-rgb"),
        "on-surface": withAlpha("--md-on-surface-rgb"),
        "on-surface-variant": withAlpha("--md-on-surface-variant-rgb"),
        outline: withAlpha("--md-outline-rgb"),
        error: withAlpha("--md-error-rgb"),
        "on-error": withAlpha("--md-on-error-rgb"),
        success: withAlpha("--md-success-rgb"),
        "success-container": withAlpha("--md-success-container-rgb"),
        warning: withAlpha("--md-warning-rgb"),
        "warning-container": withAlpha("--md-warning-container-rgb"),
      },
      borderRadius: {
        "md-sm": "var(--md-radius-sm)",
        "md-md": "var(--md-radius-md)",
        "md-lg": "var(--md-radius-lg)",
      },
      boxShadow: {
        "md-1": "var(--md-shadow-1)",
        "md-2": "var(--md-shadow-2)",
      },
      fontFamily: {
        // apps/web loads the actual font via next/font/google and exposes it
        // as --font-roboto-flex; falling back to the family name lets this
        // preset work in non-Next.js consumers (e.g. component tests) too.
        sans: [
          "var(--font-roboto-flex)",
          "Roboto Flex",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
};
