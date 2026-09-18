import { LineStyle, type Coordinate, type IChartApi, type IPriceLine, type ISeriesApi, type LineWidth } from "lightweight-charts";
import type { Bar } from "@xau-trader/protocol";
import { hexToRgb, mixWithWhite, rgbToHex } from "./color";
import { snapPrice } from "./magnet";

export interface DraggableLine {
  id: string;
  price: number;
  color: string;
  title: string;
  draggable: boolean;
  dashed?: boolean;
}

export interface HoverInfo {
  id: string;
  price: number;
  clientX: number;
  clientY: number;
}

const HIT_TOLERANCE_PX = 8;
const HOVER_TRANSITION_MS = 150;
const HOVER_LIGHTEN = 0.35; // 0..1, how much closer to white the hover/drag color moves
const DRAG_LIGHTEN = 0.55;
const MAGNET_TOLERANCE_PX = 10;

interface LineEntry {
  opts: DraggableLine;
  handle: IPriceLine;
  cancelColorAnim: (() => void) | null;
}

// lightweight-charts (the free TradingView library, as opposed to their
// licensed Advanced Charting Library) has no built-in draggable price
// lines — this hand-rolls that interaction on top of createPriceLine() +
// priceToCoordinate()/coordinateToPrice(), matching the drag-to-set-SL/TP
// UX the native MT5 panel already has (see Chart/LevelLines.mqh /
// PositionLines.mqh, which this is the web equivalent of). Also hand-rolls
// hover feedback (cursor + a brightened color/thickness transition) since
// none of that comes for free on a canvas-drawn line either.
export class PriceLineDragController {
  private chart: IChartApi;
  private series: ISeriesApi<"Candlestick">;
  private container: HTMLElement;
  private lines = new Map<string, LineEntry>();
  private draggingId: string | null = null;
  private hoveredId: string | null = null;
  private bars: Bar[] = [];
  private magnetEnabled = false;
  private onDrag: (id: string, price: number) => void = () => {};
  private onDragEnd: (id: string, price: number) => void = () => {};
  private onHover: (info: HoverInfo | null) => void = () => {};

  constructor(chart: IChartApi, series: ISeriesApi<"Candlestick">, container: HTMLElement) {
    this.chart = chart;
    this.series = series;
    this.container = container;
    // Capture phase, not bubble: lightweight-charts attaches its own
    // pan/crosshair pointerdown handler directly on its internal canvas (a
    // descendant of `container`), which fires *before* a bubble-phase
    // listener on the container ever would and can stop the event from
    // bubbling further — a container-level bubble listener would then
    // never see the click at all. Capture runs top-down before that, so
    // this always sees the event first; stopPropagation() below is what
    // then actually suppresses the chart's own pan/drag for this pointer
    // when it started on a draggable line. This was the confirmed root
    // cause of drag not working at all (Fix-Bugs.md item 8) — reasoned
    // from lightweight-charts' architecture since I have no way to test a
    // real browser directly.
    container.addEventListener("pointerdown", this.handlePointerDown, { capture: true });
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    // Bubble is fine here — pure hover feedback, nothing to intercept.
    container.addEventListener("pointermove", this.handleHoverMove);
    container.addEventListener("pointerleave", this.handleHoverLeave);
  }

  setCallbacks(onDrag: (id: string, price: number) => void, onDragEnd: (id: string, price: number) => void): void {
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
  }

  // Piggybacks on the existing hover tracking (handleHoverMove/Leave) rather
  // than adding new listeners — used by PriceLineTooltip to show a
  // potential-P&L readout while hovering a position's SL/TP line.
  setHoverCallback(cb: (info: HoverInfo | null) => void): void {
    this.onHover = cb;
  }

  // Used by the magnet feature (see lib/magnet.ts) to snap a dragged
  // price to the nearest candle wick/open/close — kept in sync with
  // LiveChart's `bars` prop, same as DrawingLayerController.
  setBars(bars: Bar[]): void {
    this.bars = bars;
  }

  setMagnetEnabled(enabled: boolean): void {
    this.magnetEnabled = enabled;
  }

  // Reconciles the visible price lines against `lines`, keyed by id. A line
  // mid-drag keeps its own live price rather than snapping back to a
  // possibly-stale prop value from before the drag finished.
  setLines(lines: DraggableLine[]): void {
    const nextIds = new Set(lines.map((l) => l.id));
    for (const [id, entry] of this.lines) {
      if (!nextIds.has(id)) {
        entry.cancelColorAnim?.();
        this.series.removePriceLine(entry.handle);
        this.lines.delete(id);
      }
    }

    for (const line of lines) {
      const existing = this.lines.get(line.id);
      if (existing) {
        if (this.draggingId === line.id) continue;
        existing.opts = line;
        // Re-apply price/title/style, but leave color/width alone if this
        // line is currently mid hover-transition — applyVisualState below
        // owns those two once an interaction is in progress.
        existing.handle.applyOptions({
          price: line.price,
          title: line.title,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          ...(this.hoveredId === line.id ? {} : { color: line.color, lineWidth: 2 as LineWidth }),
        });
      } else {
        const handle = this.series.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 2,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: line.title,
        });
        this.lines.set(line.id, { opts: line, handle, cancelColorAnim: null });
      }
    }
  }

  destroy(): void {
    this.container.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.container.removeEventListener("pointermove", this.handleHoverMove);
    this.container.removeEventListener("pointerleave", this.handleHoverLeave);
    for (const entry of this.lines.values()) {
      entry.cancelColorAnim?.();
      this.series.removePriceLine(entry.handle);
    }
    this.lines.clear();
  }

  private hitTest(clientY: number): string | null {
    const rect = this.container.getBoundingClientRect();
    const y = clientY - rect.top;
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const [id, entry] of this.lines) {
      if (!entry.opts.draggable) continue;
      const coord = this.series.priceToCoordinate(entry.opts.price);
      if (coord == null) continue;
      const dist = Math.abs(coord - y);
      if (dist <= HIT_TOLERANCE_PX && dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  // Animates color (brighten) + snaps width (only 4 discrete values exist,
  // nothing meaningful to interpolate) toward whatever `depth` implies.
  // "none" reverts to the line's own base color/width.
  private setDepth(id: string, depth: "none" | "hover" | "drag"): void {
    const entry = this.lines.get(id);
    if (!entry) return;
    entry.cancelColorAnim?.();

    const targetColor = depth === "drag" ? mixWithWhite(entry.opts.color, DRAG_LIGHTEN) : depth === "hover" ? mixWithWhite(entry.opts.color, HOVER_LIGHTEN) : entry.opts.color;
    const targetWidth: LineWidth = depth === "drag" ? 4 : depth === "hover" ? 3 : 2;

    entry.handle.applyOptions({ lineWidth: targetWidth });

    const fromRgb = hexToRgb(entry.opts.color); // animate from the *base* color, never chain hover->hover drift
    const toRgb = hexToRgb(targetColor);
    if (!fromRgb || !toRgb) {
      entry.handle.applyOptions({ color: targetColor });
      entry.cancelColorAnim = null;
      return;
    }

    let cancelled = false;
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / HOVER_TRANSITION_MS);
      const eased = 1 - Math.pow(1 - t, 2); // easeOutQuad — quick and deliberate, not sluggish
      entry.handle.applyOptions({
        color: rgbToHex({
          r: fromRgb.r + (toRgb.r - fromRgb.r) * eased,
          g: fromRgb.g + (toRgb.g - fromRgb.g) * eased,
          b: fromRgb.b + (toRgb.b - fromRgb.b) * eased,
        }),
      });
      if (t < 1) requestAnimationFrame(step);
      else entry.cancelColorAnim = null;
    };
    entry.cancelColorAnim = () => {
      cancelled = true;
    };
    requestAnimationFrame(step);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    const bestId = this.hitTest(e.clientY);
    if (bestId) {
      this.draggingId = bestId;
      this.container.style.cursor = "ns-resize";
      this.setDepth(bestId, "drag");
      e.preventDefault();
      // stopImmediatePropagation (not just stopPropagation): also blocks
      // DrawingLayerController's own capture-phase pointerdown listener on
      // this same container element — same-node listeners otherwise all
      // still fire regardless of a plain stopPropagation(). Without this,
      // starting a drag exactly on an SL/TP line while the Selector tool
      // is active would simultaneously kick off a marquee-select on the
      // same gesture.
      e.stopImmediatePropagation();
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.draggingId) return;
    const entry = this.lines.get(this.draggingId);
    if (!entry) return;

    const rect = this.container.getBoundingClientRect();
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    let price: number | null = this.series.coordinateToPrice(y as Coordinate);
    if (price == null) return;

    if (this.magnetEnabled) {
      const x = e.clientX - rect.left;
      const time = this.chart.timeScale().coordinateToTime(x);
      // Beyond the loaded/visible range coordinateToTime can return null
      // (see lib/drawingTools.ts's toPoint for the same case with a real
      // fallback) — here it's fine to just skip the snap for this frame
      // rather than extrapolate, since a price-line drag always tracks a
      // real, already-visible position/plan line.
      if (time != null) price = snapPrice(price, time as unknown as number, this.bars, MAGNET_TOLERANCE_PX, (p) => this.series.priceToCoordinate(p));
    }

    entry.handle.applyOptions({ price });
    entry.opts = { ...entry.opts, price };
    this.onDrag(this.draggingId, price);
  };

  private handlePointerUp = (): void => {
    if (!this.draggingId) return;
    const entry = this.lines.get(this.draggingId);
    const id = this.draggingId;
    this.draggingId = null;
    // Settle into "hover" depth if the pointer is still over the line
    // (almost certainly true right after a drag release), else "none".
    this.setDepth(id, this.hoveredId === id ? "hover" : "none");
    this.container.style.cursor = this.hoveredId ? "ns-resize" : "";
    if (entry) this.onDragEnd(id, entry.opts.price);
  };

  private handleHoverMove = (e: PointerEvent): void => {
    if (this.draggingId) return; // mid-drag owns cursor/depth already
    const hitId = this.hitTest(e.clientY);
    if (hitId !== this.hoveredId) {
      if (this.hoveredId) this.setDepth(this.hoveredId, "none");
      this.hoveredId = hitId;
      if (hitId) this.setDepth(hitId, "hover");
      this.container.style.cursor = hitId ? "ns-resize" : "";
    }
    const entry = hitId ? this.lines.get(hitId) : undefined;
    this.onHover(entry ? { id: hitId as string, price: entry.opts.price, clientX: e.clientX, clientY: e.clientY } : null);
  };

  private handleHoverLeave = (): void => {
    if (this.draggingId) return;
    if (this.hoveredId) this.setDepth(this.hoveredId, "none");
    this.hoveredId = null;
    this.container.style.cursor = "";
    this.onHover(null);
  };
}
