"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "@/lib/i18n";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Small reusable overlay+card confirmation modal — the one new interaction
// primitive this UI pass needs (the 50% partial-close action). Escape and a
// backdrop click both cancel; nothing here is trade-specific, so it's fine
// to reuse for any future "are you sure" action.
export function ConfirmDialog({ open, title, message, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in-up"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5" style={{ color: "var(--color-warning)" }} />
          {title}
        </h2>
        <p className="text-sm text-text-muted">{message}</p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded border border-border py-2 text-sm text-text-primary transition-colors duration-150 hover:enabled:bg-card-alt disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded py-2 text-sm font-semibold text-white transition-transform duration-150 hover:enabled:brightness-110 active:enabled:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {confirmLabel ?? t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
