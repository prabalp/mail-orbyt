import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

export type ButtonVariant = "filled" | "tonal" | "outlined" | "text" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  filled: "bg-primary text-on-primary hover:bg-primary/90 disabled:bg-on-surface/12",
  tonal:
    "bg-primary-container text-on-primary-container hover:bg-primary-container/80 disabled:bg-on-surface/12",
  outlined:
    "border border-outline text-primary bg-transparent hover:bg-primary-container/40 disabled:border-on-surface/20",
  text: "bg-transparent text-primary hover:bg-primary-container/40 disabled:text-on-surface/38",
  destructive: "bg-error text-on-error hover:bg-error/90 disabled:bg-on-surface/12",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "filled", size = "md", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-md-lg font-medium",
        "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:text-on-surface/38",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
});
