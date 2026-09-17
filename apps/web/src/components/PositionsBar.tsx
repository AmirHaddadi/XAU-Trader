import type { OrderAck } from "@/lib/useBridgeSocket";
import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";
import { useI18n } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { Spinner } from "./Spinner";

interface PositionsBarProps {
  positions: PositionInfo[];
  symbol: SymbolMeta | undefined;
  onClose: (ticket: number) => Promise<OrderAck>;
}

// Drag-to-modify SL/TP happens on the chart (see the position lines fed
// into LiveChart in page.tsx) — this table is the read-only summary plus
// the one action a price-line drag can't express: closing the position.
export function PositionsBar({ positions, symbol, onClose }: PositionsBarProps) {
  const { t } = useI18n();
  const digits = symbol?.digits ?? 2;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-text-primary">{t("openPositions")}</h2>
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
              <PositionRow key={p.ticket} position={p} digits={digits} onClose={onClose} />
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
}

// Split out from the table body so each row owns its own close-in-flight
// state via useAsyncAction — hooks can't be called inside a .map()
// callback directly, and per-row pending (rather than one flag for the
// whole table) means closing one position doesn't disable every other
// row's button too.
function PositionRow({ position: p, digits, onClose }: PositionRowProps) {
  const { t } = useI18n();
  const { run, pending } = useAsyncAction({
    action: onClose,
    successMessage: t("positionClosed"),
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
        <button
          type="button"
          disabled={pending}
          onClick={() => void run(p.ticket)}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:enabled:border-sell hover:enabled:text-sell disabled:opacity-50"
        >
          {pending && <Spinner size={11} />}
          {t("close")}
        </button>
      </td>
    </tr>
  );
}
