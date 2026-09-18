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

// A genuine "chart builds itself" entrance — candles cascade in right-to-
// left, newest-first, like a row of dominoes toppling back through history,
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
  const noCancel = () => {
    cancelled = true;
  };

  // The dashboard's chart stays mounted-but-hidden (display:none) while
  // another tab is active (see page.tsx) so live ticks are never missed —
  // but that means a background reload can now land while the chart has
  // zero pixel size, and lightweight-charts' coordinate-based APIs throw
  // "Value is null" against a pane with no laid-out dimensions (found
  // live, not from docs — includes setVisibleRange, and paneSize() itself
  // isn't confidently ruled out either, hence the broad try/catch rather
  // than checking paneSize().width alone). Fall back to a plain, always-
  // safe setData() rather than crash the page; a ResizeObserver in
  // LiveChart.tsx calls fitContent() once the chart is visible again to
  // correct the view.
  try {
    if (chart.paneSize().width === 0) {
      series.setData(full);
      return noCancel;
    }
    chart.timeScale().setVisibleRange({ from: full[0].time, to: full[full.length - 1].time });
  } catch {
    series.setData(full);
    return noCancel;
  }

  const startTime = performance.now();

  function step(now: number) {
    if (cancelled) return;
    const rawProgress = Math.min(1, (now - startTime) / DURATION_MS);
    const eased = easeOutCubic(rawProgress);
    const stepIndex = Math.max(1, Math.min(STEPS, Math.ceil(eased * STEPS)));
    const count = Math.max(1, Math.round((stepIndex / STEPS) * full.length));

    try {
      // Keep the most recent `count` bars (the tail of the ascending-sorted
      // array) — the newest, rightmost candles are what's present from
      // step 1, and each subsequent step reaches further back into history
      // (further left), which is what reads as a right-to-left cascade
      // rather than the dataset simply filling in from the left.
      series.setData(full.slice(full.length - count));
    } catch {
      // The tab was switched away mid-animation (chart just became
      // hidden) — stop animating rather than keep throwing every frame;
      // the ResizeObserver catch-up handles showing the final data once
      // it's visible again.
      cancelled = true;
      return;
    }

    if (rawProgress < 1) {
      requestAnimationFrame(step);
    } else {
      series.setData(full); // guarantee the exact final dataset, no rounding gaps
    }
  }

  requestAnimationFrame(step);

  return noCancel;
}

// Applies a full bars replacement without any animation and without
// touching the visible range — used when `bars` changed only because a
// dropped connection resynced (see useBridgeSocket's barsResyncEpoch), not
// because the user switched symbol/timeframe or asked for anything. The
// user's pan/zoom position on the chart must survive this untouched; unlike
// revealBarsAnimated (which deliberately re-fits, appropriate for a genuine
// fresh load) this captures the current visible range and reasserts it
// right after the data swap, exactly like revealOlderBarsAnimated's
// approach but instant since there is no new content to reveal.
export function applyBarsSilently(chart: IChartApi, series: ISeriesApi<"Candlestick">, bars: Bar[]): void {
  const full = toCandlestickData(bars);
  if (full.length === 0) {
    series.setData(full);
    return;
  }
  try {
    if (chart.paneSize().width === 0) {
      series.setData(full);
      return;
    }
    const savedRange = chart.timeScale().getVisibleRange();
    series.setData(full);
    if (savedRange) chart.timeScale().setVisibleRange(savedRange);
  } catch {
    series.setData(full);
  }
}

// History-page entrance — used when the user pans back near the left edge
// and an older batch of bars lands. Unlike revealBarsAnimated (a fresh
// load/timeframe switch, where the whole dataset has no "current view" to
// protect yet), this must NOT touch the visible time range: the user is
// actively looking at something. It captures the range before the first
// frame and re-asserts it after every setData() call, so the newly-
// revealed older candles animate in to the left of/behind the current
// viewport rather than yanking the camera to fit the enlarged dataset.
//
// `mergedBars` is the full, already-deduped bars array (older + existing);
// `addedCount` is how many bars at the front of it are new this call.
export function revealOlderBarsAnimated(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  mergedBars: Bar[],
  addedCount: number,
): () => void {
  let cancelled = false;
  const noCancel = () => {
    cancelled = true;
  };

  const full = toCandlestickData(mergedBars);

  if (addedCount <= 0 || mergedBars.length === 0) {
    series.setData(full);
    return noCancel;
  }

  let savedRange: ReturnType<ReturnType<IChartApi["timeScale"]>["getVisibleRange"]> = null;
  try {
    if (chart.paneSize().width === 0) {
      series.setData(full);
      return noCancel;
    }
    savedRange = chart.timeScale().getVisibleRange();
  } catch {
    series.setData(full);
    return noCancel;
  }

  // Fewer steps for a small page than a fresh 5000-bar load — no point
  // animating 45 frames to reveal 20 candles.
  const steps = Math.max(6, Math.min(STEPS, Math.round(addedCount / 15)));
  const duration = Math.max(350, Math.min(DURATION_MS, addedCount * 3));
  const startTime = performance.now();

  function step(now: number) {
    if (cancelled) return;
    const rawProgress = Math.min(1, (now - startTime) / duration);
    const eased = easeOutCubic(rawProgress);
    const stepIndex = Math.max(1, Math.min(steps, Math.ceil(eased * steps)));
    const revealed = Math.max(1, Math.round((stepIndex / steps) * addedCount));
    const startIdx = addedCount - revealed;

    try {
      series.setData(full.slice(startIdx));
      if (savedRange) chart.timeScale().setVisibleRange(savedRange);
    } catch {
      cancelled = true;
      return;
    }

    if (rawProgress < 1) {
      requestAnimationFrame(step);
    } else {
      try {
        series.setData(full);
        if (savedRange) chart.timeScale().setVisibleRange(savedRange);
      } catch {
        // chart went hidden right at the tail end — nothing left to do
      }
    }
  }

  requestAnimationFrame(step);

  return noCancel;
}
