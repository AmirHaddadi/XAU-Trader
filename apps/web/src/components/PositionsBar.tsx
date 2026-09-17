import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";
import { useI18n } from "@/lib/i18n";

interface PositionsBarProps {
  positions: PositionInfo[];
  symbol: SymbolMeta | undefined;
  onClose: (ticket: number) => void;
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
              <tr key={p.ticket} className="border-t border-border transition-colors duration-150 hover:bg-card-alt/60">
                <td className="py-1.5 text-text-muted">{p.ticket}</td>
                <td className="py-1.5" style={{ color: p.type === "buy" ? "var(--color-buy)" : "var(--color-sell)" }}>
                  {p.type.toUpperCase()}
                </td>
                <td className="py-1.5 tabular-nums">{p.volume.toFixed(2)}</td>
                <td className="py-1.5 tabular-nums">{p.priceOpen.toFixed(digits)}</td>
                <td className="py-1.5 tabular-nums">{p.sl > 0 ? p.sl.toFixed(digits) : "—"}</td>
                <td className="py-1.5 tabular-nums">{p.tp > 0 ? p.tp.toFixed(digits) : "—"}</td>
                <td
                  className="py-1.5 text-right tabular-nums"
                  style={{ color: p.profit >= 0 ? "var(--color-buy)" : "var(--color-sell)" }}
                >
                  {p.profit.toFixed(2)}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onClose(p.ticket)}
                    className="rounded border border-border px-2 py-0.5 text-xs text-text-muted transition-colors duration-150 hover:border-sell hover:text-sell"
                  >
                    {t("close")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
