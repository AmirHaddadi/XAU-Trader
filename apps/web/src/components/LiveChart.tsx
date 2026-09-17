"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Bar, Drawing, DrawingTool } from "@xau-trader/protocol";
import { PriceLineDragController, type DraggableLine } from "@/lib/priceLineDrag";
import { DrawingLayerController } from "@/lib/drawingTools";
import { readChartPalette } from "@/lib/theme";
import { useCandleCountdown } from "@/lib/useCandleCountdown";
import { revealBarsAnimated } from "@/lib/chartReveal";

interface LiveChartProps {
  bars: Bar[];
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
}: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dragRef = useRef<PriceLineDragController | null>(null);
  const drawRef = useRef<DrawingLayerController | null>(null);
  const callbacksRef = useRef({ onLineDrag, onLineDragEnd, onDrawingCreated, onDrawingSelectedChange });
  callbacksRef.current = { onLineDrag, onLineDragEnd, onDrawingCreated, onDrawingSelectedChange };

  const countdown = useCandleCountdown(liveBar, timeframe);

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

    chartRef.current = chart;
    seriesRef.current = series;
    dragRef.current = drag;
    drawRef.current = draw;
    return () => {
      drag.destroy();
      draw.destroy();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dragRef.current = null;
      drawRef.current = null;
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
    if (!chartRef.current || !seriesRef.current || bars.length === 0) return;
    const cancel = revealBarsAnimated(chartRef.current, seriesRef.current, bars);
    return cancel;
  }, [bars]);

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

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {countdown && (
        <div
          className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-border bg-card/90 px-2 py-1 text-xs tabular-nums backdrop-blur-sm"
          style={{
            color:
              countdown.urgency === "critical"
                ? "var(--color-sell)"
                : countdown.urgency === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-text-muted)",
          }}
        >
          {timeframe} · {countdown.label}
        </div>
      )}
    </div>
  );
}
