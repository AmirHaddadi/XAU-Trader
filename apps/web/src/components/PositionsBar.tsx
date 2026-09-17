import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";

interface PositionsBarProps {
  positions: PositionInfo[];
  symbol: SymbolMeta | undefined;
}

// Phase A: read-only mirror of CPositionTracker::ScanSymbol. Drag-to-modify
// SL/TP and close actions arrive in Phase B alongside order.* wiring.
export function PositionsBar({ positions, symbol }: PositionsBarProps) {
  const digits = symbol?.digits ?? 2;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-text-primary">Open Positions</h2>
      {positions.length === 0 ? (
        <p className="text-sm text-text-muted">No open positions</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-1 font-normal">Ticket</th>
              <th className="pb-1 font-normal">Type</th>
              <th className="pb-1 font-normal">Volume</th>
              <th className="pb-1 font-normal">Open</th>
              <th className="pb-1 font-normal">SL</th>
              <th className="pb-1 font-normal">TP</th>
              <th className="pb-1 font-normal text-right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ticket} className="border-t border-border">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
