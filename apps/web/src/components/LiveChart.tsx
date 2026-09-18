"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Bar, Drawing, DrawingTool, PositionInfo } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleDot, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { PriceLineDragController, type DraggableLine } from "@/lib/priceLineDrag";
import { DrawingLayerController } from "@/lib/drawingTools";
import { PnlOverlayController } from "@/lib/pnlOverlay";
import { readChartPalette } from "@/lib/theme";
import { useCandleCountdown } from "@/lib/useCandleCountdown";
import { applyBarsSilently, revealBarsAnimated, revealOlderBarsAnimated } from "@/lib/chartReveal";
import { useI18n } from "@/lib/i18n";

// How close (in bar-index terms) the visible left edge has to get to the
// start of the currently-loaded data before another history page is
// requested. Logical-range indices are 0-based over whatever's currently in
// the series, so this is independent of how many bars have loaded so far.
const HISTORY_EDGE_THRESHOLD = 50;

// Matches timeScale's own configured rightOffset below — that's how many
// bars of empty space sit to the right of the last candle at the resting
// "live" position, so scrollPosition() reads ~RIGHT_OFFSET there, not 0.
// A little slack (LIVE_EDGE_TOLERANCE) avoids the "Go Live" button
// flickering in/out from sub-bar scroll jitter right at that position.
const RIGHT_OFFSET = 12;
const LIVE_EDGE_TOLERANCE = 3;

interface LiveChartProps {
  bars: Bar[];
  // How many bars at the front of `bars` are new since the last render from
  // an older-history page landing (0 for a fresh load/timeframe switch) —
  // tells the reveal effect below which animation applies. See
  // useBridgeSocket's bars.data handler.
  barsAppendedOlderCount: number;
  // Bumped by useBridgeSocket whenever `bars` was just silently replaced by
  // a post-reconnect resync rather than a genuine load/switch — see the
  // bars-reload effect below, which reads this to skip the reveal
  // animation and view re-fit entirely for that case.
  barsResyncEpoch: number;
  liveBar: Bar | undefined;
  timeframe: string | undefined;
  gridVisible: boolean;
  theme: string; // re-applies canvas colors on change — see lib/theme.ts
  lines: DraggableLine[];
  onLineDrag?: (id: string, price: number) => void;
  onLineDragEnd?: (id: string, price: number) => void;
  drawings: Drawing[];
  activeDrawingTool: DrawingTool | null;
  onDrawingCreated: (drawing: Drawing) => void;
  onDrawingSelectedChange: (id: string | null) => void;
  hasMoreHistory: boolean;
  loadingOlderBars: boolean;
  onRequestOlderBars: () => void;
  positions: PositionInfo[];
  currency: string | undefined;
}

// Candles from the EA's CopyRates history (full reload on `bars` change) +
// live bar.update pushes (incremental `series.update()` on `liveBar`
// change — deliberately NOT setData(), which used to reset the user's
// zoom/pan on every live tick, see Fix-Bugs.md item 9), plus a hand-rolled
// draggable-price-line overlay and drawing-tools overlay (trendline/ray/
// fib) that stand in for the native panel's chart-native lines
// (Chart/LevelLines.mqh / PositionLines.mqh) and for TradingView-style
// drawing tools respectively — lightweight-charts (the free library) has
// neither built in.
export function LiveChart({
  bars,
  barsAppendedOlderCount,
  barsResyncEpoch,
  liveBar,
  timeframe,
  gridVisible,
  theme,
  lines,
  onLineDrag,
  onLineDragEnd,
  drawings,
  activeDrawingTool,
  onDrawingCreated,
  onDrawingSelectedChange,
  hasMoreHistory,
  loadingOlderBars,
  onRequestOlderBars,
  positions,
  currency,
}: LiveChartProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dragRef = useRef<PriceLineDragController | null>(null);
  const drawRef = useRef<DrawingLayerController | null>(null);
  const pnlRef = useRef<PnlOverlayController | null>(null);
  const callbacksRef = useRef({ onLineDrag, onLineDragEnd, onDrawingCreated, onDrawingSelectedChange, onRequestOlderBars });
  callbacksRef.current = { onLineDrag, onLineDragEnd, onDrawingCreated, onDrawingSelectedChange, onRequestOlderBars };
  // Read inside the pan-subscription's handler without re-subscribing on
  // every render — subscribeVisibleLogicalRangeChange is wired once at
  // mount (see below).
  const historyGateRef = useRef({ hasMoreHistory, loadingOlderBars });
  historyGateRef.current = { hasMoreHistory, loadingOlderBars };
  // Tracks the last epoch this component actually reacted to, so the
  // bars-reload effect below can tell "bars changed because of a resync"
  // apart from "bars changed because of a genuine load/switch" without the
  // bridge having to thread that distinction through `bars` itself.
  const prevResyncEpochRef = useRef(barsResyncEpoch);

  const countdown = useCandleCountdown(liveBar, timeframe);
  // Whether the view has been panned/zoomed away from the live edge — see
  // the onVisibleLogicalRangeChange subscription below. Drives the
  // "Go Live" button; scrollToRealTime() (also below) is what it calls.
  const [showGoLive, setShowGoLive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = readChartPalette();

    const chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: palette.textMuted },
      grid: {
        vertLines: { color: palette.grid, visible: gridVisible },
        horzLines: { color: palette.grid, visible: gridVisible },
      },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 12 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: palette.buy,
      downColor: palette.sell,
      borderVisible: false,
      wickUpColor: palette.buy,
      wickDownColor: palette.sell,
    });

    const drag = new PriceLineDragController(series, container);
    drag.setCallbacks(
      (id, price) => callbacksRef.current.onLineDrag?.(id, price),
      (id, price) => callbacksRef.current.onLineDragEnd?.(id, price),
    );

    const draw = new DrawingLayerController(chart, series, container);
    draw.setCallbacks(
      (d) => callbacksRef.current.onDrawingCreated(d),
      (id) => callbacksRef.current.onDrawingSelectedChange(id),
    );

    const pnl = new PnlOverlayController(chart, series, container);

    chartRef.current = chart;
    seriesRef.current = series;
    dragRef.current = drag;
    drawRef.current = draw;
    pnlRef.current = pnl;

    // The chart stays mounted-but-hidden (display:none) on other tabs so
    // live ticks are never missed (see page.tsx) — but a background reload
    // that lands while hidden has to skip the coordinate-based reveal
    // animation entirely (see lib/chartReveal.ts; zero-size panes throw).
    // Catch up once real layout resumes: re-fit the view the moment the
    // container actually gets pixels again.
    let wasVisible = container.clientWidth > 0;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const isVisible = entry.contentRect.width > 0;
      if (isVisible && !wasVisible) chart.timeScale().fitContent();
      wasVisible = isVisible;
    });
    resizeObserver.observe(container);

    // Infinite-scroll-style history: as the user pans/zooms back toward the
    // start of the currently-loaded data, request another page. Logical
    // range `from` is a 0-based index into the series' own data (not a bar
    // count independent of what's loaded), so a fixed threshold works the
    // same whether 500 bars are loaded or 50,000 are.
    function onVisibleLogicalRangeChange(range: { from: number; to: number } | null) {
      if (!range) return;
      if (historyGateRef.current.loadingOlderBars || !historyGateRef.current.hasMoreHistory) return;
      if (range.from < HISTORY_EDGE_THRESHOLD) callbacksRef.current.onRequestOlderBars();
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);

    // "Go Live": scrollPosition() is the distance (in bars) from the right
    // edge of the timescale to the latest bar — ~RIGHT_OFFSET at the
    // resting live position (that's the configured gap, not 0), and
    // shrinking as the user pans/zooms back into history.
    function onScrollPositionChange() {
      const pos = chart.timeScale().scrollPosition();
      setShowGoLive(pos < RIGHT_OFFSET - LIVE_EDGE_TOLERANCE);
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(onScrollPositionChange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onScrollPositionChange);
      resizeObserver.disconnect();
      drag.destroy();
      draw.destroy();
      pnl.destroy();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dragRef.current = null;
      drawRef.current = null;
      pnlRef.current = null;
    };
    // Intentionally mount-only: theme/gridVisible are re-applied by the
    // effects below via applyOptions() rather than recreating the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-resolve real color values on theme switch — canvas can't read
  // "var(--color-x)" itself, see lib/theme.ts.
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    const palette = readChartPalette();
    chartRef.current.applyOptions({
      layout: { textColor: palette.textMuted },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
    });
    seriesRef.current.applyOptions({
      upColor: palette.buy,
      downColor: palette.sell,
      wickUpColor: palette.buy,
      wickDownColor: palette.sell,
    });
    // theme is a dependency purely to trigger this re-read; the values
    // themselves come from the DOM, not from the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    chartRef.current?.applyOptions({ grid: { vertLines: { visible: gridVisible }, horzLines: { visible: gridVisible } } });
  }, [gridVisible]);

  // Full reload only — timeframe switch or initial history. NOT called for
  // live ticks (see `liveBar` below), so panning/zoom survives streaming.
  // Now also the chart's only "loading" moment (it stays mounted across tab
  // switches — see page.tsx — so this genuinely only fires on a real
  // load/timeframe change), which is what makes a premium staged reveal
  // appropriate here instead of distracting on every tab visit.
  useEffect(() => {
    const isResync = barsResyncEpoch !== prevResyncEpochRef.current;
    prevResyncEpochRef.current = barsResyncEpoch;
    if (!chartRef.current || !seriesRef.current || bars.length === 0) return;
    // A reconnect resync — the data may have refreshed but the user never
    // asked for this and didn't move; apply it without touching their
    // current view at all (see the "chart must never reposition itself"
    // requirement — lib/chartReveal.ts's applyBarsSilently).
    if (isResync) {
      applyBarsSilently(chartRef.current, seriesRef.current, bars);
      return;
    }
    // A history page landing (older bars prepended while the user pans
    // back) needs a different reveal that preserves their current view —
    // revealBarsAnimated's full-fit behavior would yank the camera to the
    // enlarged dataset on every page. See lib/chartReveal.ts.
    const cancel =
      barsAppendedOlderCount > 0
        ? revealOlderBarsAnimated(chartRef.current, seriesRef.current, bars, barsAppendedOlderCount)
        : revealBarsAnimated(chartRef.current, seriesRef.current, bars);
    return cancel;
  }, [bars, barsAppendedOlderCount, barsResyncEpoch]);

  // Incremental — the actual "live" part of the chart.
  useEffect(() => {
    if (!seriesRef.current || !liveBar) return;
    seriesRef.current.update({
      time: liveBar.time as UTCTimestamp,
      open: liveBar.open,
      high: liveBar.high,
      low: liveBar.low,
      close: liveBar.close,
    });
  }, [liveBar]);

  useEffect(() => {
    dragRef.current?.setLines(lines);
  }, [lines]);

  useEffect(() => {
    drawRef.current?.setDrawings(drawings);
  }, [drawings]);

  useEffect(() => {
    drawRef.current?.setActiveTool(activeDrawingTool);
  }, [activeDrawingTool]);

  useEffect(() => {
    pnlRef.current?.setPositions(positions, currency);
  }, [positions, currency]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {showGoLive && (
        <button
          type="button"
          onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 py-1 text-xs font-medium text-text-primary shadow-sm backdrop-blur-sm transition-colors duration-150 hover:bg-card-alt animate-fade-in-up"
        >
          <FontAwesomeIcon icon={faCircleDot} className="h-3 w-3" style={{ color: "var(--color-accent)" }} />
          {t("goLive")}
        </button>
      )}
      {countdown && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 py-1 text-xs tabular-nums backdrop-blur-sm"
          style={{
            color:
              countdown.urgency === "critical"
                ? "var(--color-sell)"
                : countdown.urgency === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-text-muted)",
          }}
        >
          <FontAwesomeIcon icon={faHourglassHalf} className="h-3 w-3" />
          {timeframe} · {countdown.label}
        </div>
      )}
    </div>
  );
}
