import { useState } from "react";
import type { OrderAck } from "@/lib/useBridgeSocket";
import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListCheck, faPercent, faShieldHalved, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useI18n } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { Spinner } from "./Spinner";
import { ConfirmDialog } from "./ConfirmDialog";

interface PositionsBarProps {
  positions: PositionInfo[];
  symbol: SymbolMeta | undefined;
  onClose: (ticket: number) => Promise<OrderAck>;
  onClosePartial: (ticket: number, volume: number) => Promise<OrderAck>;
  onRiskFree: (position: PositionInfo) => void;
}

// Drag-to-modify SL/TP happens on the chart (see the position lines fed
// into LiveChart in page.tsx) — this table is the read-only summary plus
// the actions a price-line drag can't express: closing the position (in
// full or half), and the one-click Risk-Free SL move.
export function PositionsBar({ positions, symbol, onClose, onClosePartial, onRiskFree }: PositionsBarProps) {
  const { t } = useI18n();
  const digits = symbol?.digits ?? 2;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5 text-text-muted" />
        {t("openPositions")}
      </h2>
      {positions.length === 0 ? (
        <p className="text-sm text-text-muted">{t("noPositions")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-1 font-normal">{t("ticket")}</th>
              <th className="pb-1 font-normal">{t("type")}</th>
              <th className="pb-1 font-normal">{t("volume")}</th>
              <th className="pb-1 font-normal">{t("entry")}</th>
              <th className="pb-1 font-normal">{t("sl")}</th>
              <th className="pb-1 font-normal">{t("tp")}</th>
              <th className="pb-1 font-normal text-right">{t("profit")}</th>
              <th className="pb-1 font-normal text-right"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <PositionRow key={p.ticket} position={p} digits={digits} onClose={onClose} onClosePartial={onClosePartial} onRiskFree={onRiskFree} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface PositionRowProps {
  position: PositionInfo;
  digits: number;
  onClose: (ticket: number) => Promise<OrderAck>;
  onClosePartial: (ticket: number, volume: number) => Promise<OrderAck>;
  onRiskFree: (position: PositionInfo) => void;
}

// Split out from the table body so each row owns its own close-in-flight
// state via useAsyncAction — hooks can't be called inside a .map()
// callback directly, and per-row pending (rather than one flag for the
// whole table) means closing one position doesn't disable every other
// row's button too.
function PositionRow({ position: p, digits, onClose, onClosePartial, onRiskFree }: PositionRowProps) {
  const { t } = useI18n();
  const [confirmingHalfClose, setConfirmingHalfClose] = useState(false);

  const { run, pending } = useAsyncAction({
    action: onClose,
    successMessage: t("positionClosed"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("positionCloseFailed")),
    errorFallbackMessage: t("positionCloseFailed"),
  });

  const halfVolume = p.volume / 2;
  const { run: runHalfClose, pending: halfClosePending } = useAsyncAction({
    action: () => onClosePartial(p.ticket, halfVolume),
    successMessage: t("positionHalfClosed"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("positionCloseFailed")),
    errorFallbackMessage: t("positionCloseFailed"),
  });

  return (
    <tr className="border-t border-border transition-colors duration-150 hover:bg-card-alt/60">
      <td className="py-1.5 text-text-muted">{p.ticket}</td>
      <td className="py-1.5" style={{ color: p.type === "buy" ? "var(--color-buy)" : "var(--color-sell)" }}>
        {p.type.toUpperCase()}
      </td>
      <td className="py-1.5 tabular-nums">{p.volume.toFixed(2)}</td>
      <td className="py-1.5 tabular-nums">{p.priceOpen.toFixed(digits)}</td>
      <td className="py-1.5 tabular-nums">{p.sl > 0 ? p.sl.toFixed(digits) : "—"}</td>
      <td className="py-1.5 tabular-nums">{p.tp > 0 ? p.tp.toFixed(digits) : "—"}</td>
      <td className="py-1.5 text-right tabular-nums" style={{ color: p.profit >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}>
        {p.profit.toFixed(2)}
      </td>
      <td className="py-1.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onRiskFree(p)}
            title={t("riskFree")}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
          >
            <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
            {t("riskFree")}
          </button>
          <button
            type="button"
            disabled={halfClosePending}
            onClick={() => setConfirmingHalfClose(true)}
            title={t("close50")}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-warning hover:enabled:text-warning disabled:opacity-50"
          >
            {halfClosePending ? <Spinner size={11} /> : <FontAwesomeIcon icon={faPercent} className="h-3 w-3" />}
            50%
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void run(p.ticket)}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-sell hover:enabled:text-sell disabled:opacity-50"
          >
            {pending ? <Spinner size={11} /> : <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />}
            {t("close")}
          </button>
        </div>
        <ConfirmDialog
          open={confirmingHalfClose}
          title={t("close50")}
          message={t("confirm50Body").replace("{ticket}", String(p.ticket)).replace("{volume}", halfVolume.toFixed(2))}
          busy={halfClosePending}
          onConfirm={() => {
            void runHalfClose().then(() => setConfirmingHalfClose(false));
          }}
          onCancel={() => setConfirmingHalfClose(false)}
        />
      </td>
    </tr>
  );
}
