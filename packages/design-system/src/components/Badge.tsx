import type { ReactNode } from "react";
import { cn } from "../cn";

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "error";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  primary: "bg-primary-container text-on-primary-container",
  success: "bg-success-container text-success",
  warning: "bg-warning-container text-warning",
  error: "bg-error/12 text-error",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
