"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCircleCheck, faCircleExclamation, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

export type ToastKind = "success" | "error" | "warning";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 4000;

const BORDER_COLOR: Record<ToastKind, string> = {
  success: "var(--color-buy)",
  error: "var(--color-sell)",
  warning: "var(--color-warning)",
};

const KIND_ICON: Record<ToastKind, IconDefinition> = {
  success: faCircleCheck,
  error: faCircleExclamation,
  warning: faTriangleExclamation,
};

// The one place any async action in the app reports its outcome to the
// user — see lib/useAsyncAction.ts. Mounted once at the app root (Shell in
// page.tsx) so every component reaches it via useToast() instead of each
// screen inventing its own inline success/error banner.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className="animate-fade-in-up pointer-events-auto flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-text-primary shadow-lg backdrop-blur-sm"
            style={{ borderColor: BORDER_COLOR[t.kind] }}
          >
            <FontAwesomeIcon icon={KIND_ICON[t.kind]} className="h-3.5 w-3.5 shrink-0" style={{ color: BORDER_COLOR[t.kind] }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
