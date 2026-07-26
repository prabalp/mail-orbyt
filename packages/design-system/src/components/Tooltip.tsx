import { useId, useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? tooltipId : undefined}>{children}</span>
      {visible ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            "absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md-sm bg-on-surface px-2 py-1 text-xs text-surface shadow-md-1",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
