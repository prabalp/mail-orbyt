import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ className, padded = true, ...props }: CardProps): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-md-lg border border-outline/30 bg-surface shadow-md-1",
        padded && "p-6",
        className,
      )}
      {...props}
    />
  );
}
