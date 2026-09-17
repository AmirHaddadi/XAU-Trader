import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PositionInfo } from "@xau-trader/protocol";

const LABEL_OFFSET_PX = 22; // above the entry-price coordinate, not on top of it

// Floating live P&L label per open position, horizontally centered above
// its entry-price line. createPriceLine()'s own `title` (used for the
// SL/TP/Entry lines themselves — see priceLineDrag.ts) only ever renders
// pinned to the right price-axis edge, too easy to miss for a running
// figure the trader actually cares about at a glance. A small absolutely-
// positioned HTML overlay instead of SVG (matching drawingTools.ts's overlay
// pattern structurally) since this is text, not geometry — DOM text layout
// is simpler and cheaper here than hand-rolling <text> metrics.
export class PnlOverlayController {
  private chart: IChartApi;
  private series: ISeriesApi<"Candlestick">;
  private layer: HTMLDivElement;
  private positions: PositionInfo[] = [];
  private currency = "";

  constructor(chart: IChartApi, series: ISeriesApi<"Candlestick">, container: HTMLElement) {
    this.chart = chart;
    this.series = series;

    this.layer = document.createElement("div");
    this.layer.style.position = "absolute";
    this.layer.style.inset = "0";
    this.layer.style.pointerEvents = "none";
    container.style.position = container.style.position || "relative";
    container.appendChild(this.layer);

    // Re-derive pixel Y from each position's own entry price on every
    // visible-range change (pan/zoom), same reasoning as
    // DrawingLayerController — cached pixels would drift as the view moves.
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.render);
  }

  // Profit is always in account currency, never symbol price units, so
  // (unlike the SL/TP/Entry price lines) this deliberately doesn't take a
  // `digits` param — PositionsBar's own P&L column is the same fixed
  // 2-decimal formatting.
  setPositions(positions: PositionInfo[], currency: string | undefined): void {
    this.positions = positions;
    this.currency = currency ?? "";
    this.render();
  }

  destroy(): void {
    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.render);
    this.layer.remove();
  }

  private render = (): void => {
    this.layer.replaceChildren();
    if (this.chart.paneSize().width === 0) return; // hidden tab — see LiveChart's ResizeObserver catch-up

    for (const p of this.positions) {
      const y = this.series.priceToCoordinate(p.priceOpen);
      if (y == null) continue;

      const positive = p.profit >= 0;
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.left = "50%";
      el.style.top = `${y - LABEL_OFFSET_PX}px`;
      el.style.transform = "translate(-50%, -100%)";
      el.style.padding = "2px 8px";
      el.style.borderRadius = "6px";
      el.style.fontSize = "11px";
      el.style.fontWeight = "600";
      el.style.fontVariantNumeric = "tabular-nums";
      el.style.whiteSpace = "nowrap";
      el.style.background = "var(--color-card)";
      el.style.border = `1px solid ${positive ? "var(--color-buy)" : "var(--color-sell)"}`;
      el.style.color = positive ? "var(--color-buy)" : "var(--color-sell)";
      el.textContent = `${positive ? "+" : ""}${p.profit.toFixed(2)}${this.currency ? ` ${this.currency}` : ""}`;
      this.layer.appendChild(el);
    }
  };
}
