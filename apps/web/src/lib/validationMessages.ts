import type { ValidationCode } from "@xau-trader/protocol";

// English wording ported from MQL5/Include/XAUTrader/GUI/Localization.mqh
// (CLocalization::En, TXT_ERR_*) — kept identical so the client sees the
// same phrasing they've already seen in the native panel. Farsi strings
// move over in Phase C alongside the rest of the i18n system.
const MESSAGES: Record<ValidationCode, string> = {
  ok: "",
  err_no_symbol: "Invalid symbol",
  err_trade_disabled: "Trading disabled for this account/symbol",
  err_market_closed: "Market is closed for this symbol",
  err_sl_missing: "Set a stop loss",
  err_sl_wrong_side: "Stop loss is on the wrong side of price",
  err_tp_wrong_side: "Take profit is on the wrong side of price",
  err_stops_level: "Distance to price is below the broker's minimum",
  err_freeze_level: "Price is within the freeze level",
  err_volume_too_small: "Computed volume is below the minimum lot",
  err_volume_too_large: "Computed volume exceeds the maximum lot",
  err_margin: "Not enough free margin",
  err_risk_value: "Invalid risk value",
  err_entry_wrong_side: "Entry price doesn't match the order type",
  err_busy: "Previous order still processing...",
};

export function validationMessage(code: ValidationCode): string {
  return MESSAGES[code] ?? code;
}
