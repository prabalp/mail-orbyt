import { cn } from "../cn";

export interface SkeletonProps {
  className?: string;
  "aria-label"?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-label={props["aria-label"] ?? "Loading"}
      className={cn("animate-pulse rounded-md-sm bg-on-surface/10", className)}
    />
  );
}
