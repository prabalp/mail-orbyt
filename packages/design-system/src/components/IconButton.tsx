import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: "standard" | "filled" | "tonal";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, icon, label, variant = "standard", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-38",
        variant === "standard" && "text-on-surface-variant hover:bg-on-surface/8",
        variant === "filled" && "bg-primary text-on-primary hover:bg-primary/90",
        variant === "tonal" &&
          "bg-primary-container text-on-primary-container hover:bg-primary-container/80",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
});
