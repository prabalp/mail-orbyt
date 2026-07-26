import { cn } from "../cn";

export type StatusTone = "success" | "warning" | "error" | "neutral";

export interface StatusIndicatorProps {
  tone: StatusTone;
  label: string;
  className?: string;
}

const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  neutral: "bg-on-surface-variant",
};

export function StatusIndicator({
  tone,
  label,
  className,
}: StatusIndicatorProps): React.ReactElement {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm text-on-surface", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", TONE_DOT_CLASSES[tone])} />
      {label}
    </span>
  );
}
