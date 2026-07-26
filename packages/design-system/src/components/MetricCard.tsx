import { cn } from "../cn";

export interface MetricCardProps {
  label: string;
  value: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
  helperText?: string;
  className?: string;
}

const TREND_CLASSES: Record<"up" | "down" | "flat", string> = {
  up: "text-success",
  down: "text-error",
  flat: "text-on-surface-variant",
};

const TREND_ICON: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export function MetricCard({
  label,
  value,
  trend,
  helperText,
  className,
}: MetricCardProps): React.ReactElement {
  return (
    <div className={cn("rounded-md-lg border border-outline/30 bg-surface p-5", className)}>
      <p className="text-sm font-normal text-on-surface-variant">{label}</p>
      <p className="mt-2 text-[32px] font-semibold leading-tight text-on-surface">{value}</p>
      {trend ? (
        <p className={cn("mt-1 text-sm font-medium", TREND_CLASSES[trend.direction])}>
          <span aria-hidden="true">{TREND_ICON[trend.direction]}</span> {trend.label}
        </p>
      ) : null}
      {helperText ? <p className="mt-1 text-sm text-on-surface-variant">{helperText}</p> : null}
    </div>
  );
}
