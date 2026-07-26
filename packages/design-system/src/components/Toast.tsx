import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "../cn";

export type ToastTone = "info" | "success" | "warning" | "error";

interface ToastRecord {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "bg-on-surface text-surface",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  error: "bg-error text-on-error",
};

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    toastIdCounter += 1;
    const id = `toast-${toastIdCounter}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-md-md px-4 py-2.5 text-sm shadow-md-2",
              TONE_CLASSES[toast.tone],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
