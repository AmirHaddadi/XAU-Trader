// Mirrors CBridgeHandlers::TimeframeFromString in MQL5/Include/XAUTrader/Bridge/Handlers.mqh —
// keep both lists in sync by hand if either changes.
export const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

const SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
};

export function timeframeSeconds(tf: string): number {
  return SECONDS[tf as Timeframe] ?? 60;
}
