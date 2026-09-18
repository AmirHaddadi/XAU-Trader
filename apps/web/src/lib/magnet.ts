import type { Bar, DrawingPoint } from "@xau-trader/protocol";

// TradingView-style "magnet" — snaps a chart click/drag point to the
// nearest candle's OHLC value (high/low, i.e. the wicks, checked first per
// Amir's "اتصال به شدوها" ask, then open/close) when within `tolerancePx`
// pixels. Used by both DrawingLayerController (new drawing anchor points)
// and PriceLineDragController (dragging SL/TP/Entry) — both already have a
// `priceToCoordinate` from their own series, so this only needs that plus
// the already-loaded `bars` array to work; no chart/timeScale reference
// required.
const WICK_FIRST_ORDER = ["high", "low", "open", "close"] as const;

// bars is oldest-first and time-sorted (see useBridgeSocket) — binary
// search keeps this cheap even against a 5,000-50,000 bar history on every
// pointermove, where a linear scan would visibly lag.
function nearestBarIndex(bars: Bar[], time: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  if (time <= bars[0].time) return 0;
  if (time >= bars[hi].time) return hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time === time) return mid;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(bars[lo - 1].time - time) <= Math.abs(bars[lo].time - time)) return lo - 1;
  return lo;
}

export function snapPoint(
  point: DrawingPoint,
  bars: Bar[],
  tolerancePx: number,
  priceToCoordinate: (price: number) => number | null | undefined,
): DrawingPoint {
  if (bars.length === 0) return point;
  const bar = bars[nearestBarIndex(bars, point.time)];
  const targetY = priceToCoordinate(point.price);
  if (targetY == null) return point;

  let bestValue: number | null = null;
  let bestDist = Infinity;
  for (const key of WICK_FIRST_ORDER) {
    const y = priceToCoordinate(bar[key]);
    if (y == null) continue;
    const dist = Math.abs(y - targetY);
    if (dist < bestDist) {
      bestDist = dist;
      bestValue = bar[key];
    }
  }
  if (bestValue == null || bestDist > tolerancePx) return point;
  return { time: bar.time, price: bestValue };
}

// Price-only convenience for PriceLineDragController, which drags a single
// price value at a known time (the cursor's current x-position converted to
// time) rather than placing a fresh DrawingPoint.
export function snapPrice(
  price: number,
  time: number,
  bars: Bar[],
  tolerancePx: number,
  priceToCoordinate: (price: number) => number | null | undefined,
): number {
  return snapPoint({ time, price }, bars, tolerancePx, priceToCoordinate).price;
}
