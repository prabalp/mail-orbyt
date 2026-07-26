import type { ReactNode } from "react";
import { cn } from "../cn";

export type AlertTone = "info" | "success" | "warning" | "error";

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<AlertTone, string> = {
  info: "border-primary/30 bg-primary-container/40 text-on-primary-container",
  success: "border-success/30 bg-success-container text-success",
  warning: "border-warning/30 bg-warning-container text-warning",
  error: "border-error/30 bg-error/10 text-error",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: AlertProps): React.ReactElement {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md-md border px-4 py-3", TONE_CLASSES[tone], className)}
    >
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm">{children}</div> : null}
    </div>
  );
}
