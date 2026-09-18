"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowTrendDown, faArrowTrendUp } from "@fortawesome/free-solid-svg-icons";
import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";
import type { HoverInfo } from "@/lib/priceLineDrag";
import { estimatePnl } from "@/lib/estimatePnl";
import { useI18n } from "@/lib/i18n";

interface PriceLineTooltipProps {
  hover: HoverInfo | null;
  positions: PositionInfo[];
  symbol: SymbolMeta | undefined;
  currency: string | undefined;
}

const POS_LINE_ID = /^pos:(\d+):(sl|tp)$/;

// "Large, standard" tooltip shown while hovering a position's SL/TP price
// line — potential profit/loss if that price were hit right now. Only for
// pos:<ticket>:sl|tp ids (a committed position's own risk), not the pending
// plan:sl/plan:tp lines, which have no position to compute against yet.
// `position: fixed` + hover.clientX/clientY (already viewport coordinates,
// same as every pointer event) needs no container-relative math.
export function PriceLineTooltip({ hover, positions, symbol, currency }: PriceLineTooltipProps) {
  const { t } = useI18n();
  if (!hover || !symbol) return null;

  const match = POS_LINE_ID.exec(hover.id);
  if (!match) return null;
  const ticket = Number(match[1]);
  const which = match[2] as "sl" | "tp";
  const position = positions.find((p) => p.ticket === ticket);
  if (!position) return null;

  const estimate = estimatePnl(position, hover.price, symbol);
  if (!estimate) return null;

  return (
    <div
      className="pointer-events-none fixed z-30 flex items-center gap-2 rounded-md border border-border bg-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm animate-fade-in-up"
      style={{ left: hover.clientX + 16, top: hover.clientY - 16 }}
    >
      <FontAwesomeIcon
        icon={estimate.isProfit ? faArrowTrendUp : faArrowTrendDown}
        className="h-3.5 w-3.5"
        style={{ color: estimate.isProfit ? "var(--color-buy)" : "var(--color-sell)" }}
      />
      <span className="font-semibold tabular-nums" style={{ color: estimate.isProfit ? "var(--color-buy)" : "var(--color-sell)" }}>
        {estimate.isProfit ? "+" : "-"}
        {estimate.amount.toFixed(2)}
        {currency ? ` ${currency}` : ""}
      </span>
      <span className="text-text-muted">
        {t(which)} · #{ticket}
      </span>
    </div>
  );
}
