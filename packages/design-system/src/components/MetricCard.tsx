import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
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

const TREND_ICON: Record<"up" | "down" | "flat", typeof ArrowUp> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
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
      {trend
        ? (() => {
            const TrendIcon = TREND_ICON[trend.direction];
            return (
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-sm font-medium",
                  TREND_CLASSES[trend.direction],
                )}
              >
                <TrendIcon size={16} aria-hidden="true" /> {trend.label}
              </p>
            );
          })()
        : null}
      {helperText ? <p className="mt-1 text-sm text-on-surface-variant">{helperText}</p> : null}
    </div>
  );
}
