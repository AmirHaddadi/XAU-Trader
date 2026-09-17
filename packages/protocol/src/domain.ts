// Domain shapes shared by the EA<->bridge and bridge<->browser wire protocols.
// Field names deliberately mirror the MQL5 structs in MQL5/Include/XAUTrader/Core/Types.mqh
// one-to-one, so the hand-rolled MQL5 JSON layer never needs a translation step.

export type RiskMode = "percent_balance" | "percent_equity" | "fixed_money";
export type PlacementType = "market" | "limit" | "stop";
export type TradeDirection = "buy" | "sell";
export type AppTheme = "dark" | "light";
export type AppLang = "fa" | "en";

// Mirrors ENUM_VALIDATION_CODE in Core/Defines.mqh
export type ValidationCode =
  | "ok"
  | "err_no_symbol"
  | "err_trade_disabled"
  | "err_market_closed"
  | "err_sl_missing"
  | "err_sl_wrong_side"
  | "err_tp_wrong_side"
  | "err_stops_level"
  | "err_freeze_level"
  | "err_volume_too_small"
  | "err_volume_too_large"
  | "err_margin"
  | "err_risk_value"
  | "err_entry_wrong_side"
  | "err_busy";

// Mirrors STradePlan
export interface TradePlan {
  riskMode: RiskMode;
  riskValue: number;
  placement: PlacementType;
  direction: TradeDirection;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  rrRatio: number;
  slUserSet: boolean;
  tpUserSet: boolean;
}

// Mirrors SRiskResult
export interface RiskResult {
  code: ValidationCode;
  lots: number;
  rawLots: number;
  riskMoney: number;
  rewardMoney: number;
  rr: number;
  marginRequired: number;
  message: string;
}

// Mirrors SSymbolSnapshot (bid/ask live in `tick`, not repeated here)
export interface SymbolMeta {
  symbol: string;
  digits: number;
  point: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  tickSize: number;
  tickValueProfit: number;
  tickValueLoss: number;
  stopsLevelPoints: number;
  freezeLevelPoints: number;
  tradeMode: number; // raw SYMBOL_TRADE_MODE_* enum value
  valid: boolean;
}

export interface Tick {
  symbol: string;
  bid: number;
  ask: number;
  time: number; // epoch seconds
}

export interface Bar {
  time: number; // epoch seconds, bar open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Mirrors SPositionInfo
export interface PositionInfo {
  ticket: number;
  type: TradeDirection;
  volume: number;
  priceOpen: number;
  sl: number;
  tp: number;
  profit: number;
  magic: number;
  timeOpen: number; // epoch seconds
}

export interface AccountSnapshot {
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
}

// One closed deal, as surfaced to the journal (DEAL_ENTRY_OUT / DEAL_ENTRY_OUT_BY)
export interface ClosedDeal {
  dealTicket: number;
  positionTicket: number;
  symbol: string;
  direction: TradeDirection;
  volume: number;
  priceOpen: number;
  priceClose: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  magic: number;
  timeOpen: number; // epoch seconds
  timeClose: number; // epoch seconds
}

export interface JournalComment {
  id: number;
  dealTicket: number;
  body: string;
  createdAt: number; // epoch ms
}
