"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
  /** Allow the user to drag the inner edge to resize the drawer's width. */
  resizable?: boolean;
  /** Persists the chosen width across sessions under this localStorage key. */
  resizeStorageKey?: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  className,
  resizable = false,
  resizeStorageKey,
  minWidth = 320,
  maxWidth = 960,
  defaultWidth = 384,
}: DrawerProps): React.ReactElement | null {
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!resizable || !resizeStorageKey) return;
    const stored = Number(window.localStorage.getItem(resizeStorageKey));
    if (stored) setWidth(Math.min(maxWidth, Math.max(minWidth, stored)));
  }, [resizable, resizeStorageKey]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!resizable) return;
    function handleMouseMove(event: MouseEvent) {
      if (!draggingRef.current) return;
      const next = side === "right" ? window.innerWidth - event.clientX : event.clientX;
      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    }
    function handleMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (resizeStorageKey) {
        setWidth((current) => {
          window.localStorage.setItem(resizeStorageKey, String(current));
          return current;
        });
      }
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizable, resizeStorageKey, side, minWidth, maxWidth]);

  if (!open) return null;

  function startDragging() {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-on-surface/40" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "relative ml-auto flex h-full flex-col bg-surface shadow-md-2",
          resizable ? "" : "w-full max-w-sm",
          side === "left" && "ml-0 mr-auto",
          className,
        )}
        style={resizable ? { width } : undefined}
      >
        {resizable ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            onMouseDown={startDragging}
            className={cn(
              "absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60",
              side === "right" ? "left-0" : "right-0",
            )}
          />
        ) : null}
        <div className="flex items-center justify-between border-b border-outline/20 px-6 py-4">
          <h2 className="text-lg font-medium text-on-surface">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1 text-on-surface-variant hover:bg-on-surface/8"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
