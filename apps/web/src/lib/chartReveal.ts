import type { CandlestickData, ISeriesApi, IChartApi, Time, UTCTimestamp } from "lightweight-charts";
import type { Bar } from "@xau-trader/protocol";

const STEPS = 45;
const DURATION_MS = 1100;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function toCandlestickData(bars: Bar[]): CandlestickData<Time>[] {
  return bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close }));
}

// A genuine "chart builds itself" entrance — candles reveal left-to-right
// across ~45 eased steps (~1.1s total) rather than the whole dataset
// appearing in one frame. Fixes the visible time range to the dataset's
// full span *before* the first step, so candle width/position stay fixed
// throughout — candles fill into their final spot rather than the chart
// rescaling as each batch lands, which is what makes it read as
// deliberate/premium instead of a loading flicker.
//
// Returns a cancel function; callers must invoke it if `bars` changes (or
// the component unmounts) mid-animation, or two reveals can race and leave
// the series in a torn state.
export function revealBarsAnimated(chart: IChartApi, series: ISeriesApi<"Candlestick">, bars: Bar[]): () => void {
  let cancelled = false;

  if (bars.length === 0) {
    series.setData([]);
    return () => {
      cancelled = true;
    };
  }

  const full = toCandlestickData(bars);
  chart.timeScale().setVisibleRange({ from: full[0].time, to: full[full.length - 1].time });

  const startTime = performance.now();

  function step(now: number) {
    if (cancelled) return;
    const rawProgress = Math.min(1, (now - startTime) / DURATION_MS);
    const eased = easeOutCubic(rawProgress);
    const stepIndex = Math.max(1, Math.min(STEPS, Math.ceil(eased * STEPS)));
    const count = Math.max(1, Math.round((stepIndex / STEPS) * full.length));
    series.setData(full.slice(0, count));

    if (rawProgress < 1) {
      requestAnimationFrame(step);
    } else {
      series.setData(full); // guarantee the exact final dataset, no rounding gaps
    }
  }

  requestAnimationFrame(step);

  return () => {
    cancelled = true;
  };
}
