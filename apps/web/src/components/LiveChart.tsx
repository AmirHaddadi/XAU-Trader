"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Bar } from "@xau-trader/protocol";
import { PriceLineDragController, type DraggableLine } from "@/lib/priceLineDrag";

interface LiveChartProps {
  bars: Bar[];
  lines: DraggableLine[];
  onLineDrag?: (id: string, price: number) => void;
  onLineDragEnd?: (id: string, price: number) => void;
}

// Candles from the EA's CopyRates history + live bar.update pushes, plus a
// hand-rolled draggable-price-line overlay (see lib/priceLineDrag.ts) that
// stands in for the native panel's chart-native Entry/SL/TP and position
// lines (Chart/LevelLines.mqh / PositionLines.mqh).
export function LiveChart({ bars, lines, onLineDrag, onLineDragEnd }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const dragRef = useRef<PriceLineDragController | null>(null);
  const callbacksRef = useRef({ onLineDrag, onLineDragEnd });
  callbacksRef.current = { onLineDrag, onLineDragEnd };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "var(--color-text-muted)",
      },
      grid: {
        vertLines: { color: "var(--color-border)" },
        horzLines: { color: "var(--color-border)" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const drag = new PriceLineDragController(series, container);
    drag.setCallbacks(
      (id, price) => callbacksRef.current.onLineDrag?.(id, price),
      (id, price) => callbacksRef.current.onLineDragEnd?.(id, price),
    );

    chartRef.current = chart;
    seriesRef.current = series;
    dragRef.current = drag;
    return () => {
      drag.destroy();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      dragRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return;
    seriesRef.current.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  useEffect(() => {
    dragRef.current?.setLines(lines);
  }, [lines]);

  return <div ref={containerRef} className="h-full w-full" />;
}
