"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Uses the native <dialog> element for built-in focus trapping, Escape-to-
 * close, and top-layer stacking instead of reimplementing those behaviours.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: DialogProps): React.ReactElement {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-full max-w-lg rounded-md-lg border border-outline/30 bg-surface p-0 shadow-md-2",
        "backdrop:bg-on-surface/40",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-outline/20 px-6 py-4">
        <h2 id="dialog-title" className="text-lg font-medium text-on-surface">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="rounded-full p-1 text-on-surface-variant hover:bg-on-surface/8"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 py-4 text-on-surface">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-outline/20 px-6 py-4">{footer}</div>
      ) : null}
    </dialog>
  );
}
