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
// Must match globals.css's .animate-toast-out-up duration — the item stays
// in `items` (rendered with the exit class) for exactly this long so the
// fade-out actually gets to play before it's removed from the DOM.
const EXIT_DURATION_MS = 220;

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
  // Two-phase removal: mark as leaving (swaps to the fade-out animation
  // class) first, then actually drop it from `items` once that animation
  // has had time to finish — a plain filter-on-dismiss made toasts vanish
  // instantly with no exit motion at all.
  const [leavingIds, setLeavingIds] = useState<Set<number>>(new Set());
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setLeavingIds((prev) => {
      if (prev.has(id)) return prev; // already leaving — don't restart/duplicate the timer
      return new Set(prev).add(id);
    });
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
      setLeavingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_DURATION_MS);
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
      {/* top-24 (not top-4): TopBar sits at the literal top of the page in
          normal flow, not fixed, so a naive top-4 would render underneath/
          overlapping its title row and connection badges — this clears it
          on every tab, including the taller dashboard stats row. */}
      <div className="pointer-events-none fixed top-24 right-4 z-50 flex w-full max-w-md flex-col gap-3">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-card px-4 py-3.5 text-[15px] font-medium text-text-primary shadow-2xl backdrop-blur-sm ${
              leavingIds.has(t.id) ? "animate-toast-out-up" : "animate-toast-in-down"
            }`}
            style={{ borderColor: BORDER_COLOR[t.kind] }}
          >
            <FontAwesomeIcon icon={KIND_ICON[t.kind]} className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BORDER_COLOR[t.kind] }} />
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
