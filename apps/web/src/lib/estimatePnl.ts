import type { PositionInfo, SymbolMeta } from "@xau-trader/protocol";

export interface PnlEstimate {
  amount: number; // account currency, unsigned magnitude
  isProfit: boolean;
}

// Mirrors CRiskEngine::Evaluate's money formula (money = distance/tickSize
// * tickValue * lots, tickValueProfit falling back to tickValueLoss) for
// **display only** — never authoritative, same UX-preview philosophy as
// the money panel's own live risk.preview numbers. Used by the TP/SL hover
// tooltip to show the potential profit/loss if the hovered line's price
// were hit right now.
export function estimatePnl(position: PositionInfo, hoveredPrice: number, symbol: SymbolMeta): PnlEstimate | null {
  if (symbol.tickSize <= 0) return null;
  const isBuy = position.type === "buy";
  const distance = hoveredPrice - position.priceOpen;
  const isProfit = isBuy ? distance > 0 : distance < 0;
  if (distance === 0) return { amount: 0, isProfit: true };

  const tickValue = isProfit ? (symbol.tickValueProfit > 0 ? symbol.tickValueProfit : symbol.tickValueLoss) : symbol.tickValueLoss;
  const moneyPerUnit = tickValue / symbol.tickSize;
  const amount = Math.abs(distance) * moneyPerUnit * position.volume;
  return { amount, isProfit };
}
