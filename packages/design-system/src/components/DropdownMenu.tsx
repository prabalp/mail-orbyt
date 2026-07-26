"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { cn } from "../cn";

export interface DropdownMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface TriggerProps {
  onClick?: (event: React.MouseEvent) => void;
  "aria-haspopup"?: "menu";
  "aria-expanded"?: boolean;
}

export interface DropdownMenuProps {
  /** A single element (e.g. <Button>, <span>) — cloned with trigger props rather than wrapped, so it never ends up nested inside another interactive element. */
  trigger: ReactElement<TriggerProps>;
  items: DropdownMenuItem[];
  align?: "start" | "end";
}

export function DropdownMenu({
  trigger,
  items,
  align = "start",
}: DropdownMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const triggerElement = isValidElement<TriggerProps>(trigger)
    ? cloneElement(trigger, {
        onClick: (event: React.MouseEvent) => {
          trigger.props.onClick?.(event);
          setOpen((prev) => !prev);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
      } satisfies TriggerProps)
    : trigger;

  return (
    <div className="relative inline-block" ref={containerRef}>
      {triggerElement}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-10 mt-2 min-w-40 rounded-md-md border border-outline/30 bg-surface py-1 shadow-md-2",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={cn(
                "block w-full px-4 py-2 text-left text-sm hover:bg-on-surface/8 disabled:cursor-not-allowed disabled:opacity-38",
                item.destructive ? "text-error" : "text-on-surface",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
