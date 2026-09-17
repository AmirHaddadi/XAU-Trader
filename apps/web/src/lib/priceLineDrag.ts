import { LineStyle, type Coordinate, type IPriceLine, type ISeriesApi } from "lightweight-charts";

export interface DraggableLine {
  id: string;
  price: number;
  color: string;
  title: string;
  draggable: boolean;
  dashed?: boolean;
}

const HIT_TOLERANCE_PX = 8;

// lightweight-charts (the free TradingView library, as opposed to their
// licensed Advanced Charting Library) has no built-in draggable price
// lines — this hand-rolls that interaction on top of createPriceLine() +
// priceToCoordinate()/coordinateToPrice(), matching the drag-to-set-SL/TP
// UX the native MT5 panel already has (see Chart/LevelLines.mqh /
// PositionLines.mqh, which this is the web equivalent of).
export class PriceLineDragController {
  private series: ISeriesApi<"Candlestick">;
  private container: HTMLElement;
  private lines = new Map<string, { opts: DraggableLine; handle: IPriceLine }>();
  private draggingId: string | null = null;
  private onDrag: (id: string, price: number) => void = () => {};
  private onDragEnd: (id: string, price: number) => void = () => {};

  constructor(series: ISeriesApi<"Candlestick">, container: HTMLElement) {
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
  }

  setCallbacks(onDrag: (id: string, price: number) => void, onDragEnd: (id: string, price: number) => void): void {
    this.onDrag = onDrag;
    this.onDragEnd = onDragEnd;
  }

  // Reconciles the visible price lines against `lines`, keyed by id. A line
  // mid-drag keeps its own live price rather than snapping back to a
  // possibly-stale prop value from before the drag finished.
  setLines(lines: DraggableLine[]): void {
    const nextIds = new Set(lines.map((l) => l.id));
    for (const [id, entry] of this.lines) {
      if (!nextIds.has(id)) {
        this.series.removePriceLine(entry.handle);
        this.lines.delete(id);
      }
    }

    for (const line of lines) {
      const existing = this.lines.get(line.id);
      if (existing) {
        if (this.draggingId === line.id) continue;
        existing.handle.applyOptions({
          price: line.price,
          color: line.color,
          title: line.title,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
        });
        existing.opts = line;
      } else {
        const handle = this.series.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 2,
          lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: line.title,
        });
        this.lines.set(line.id, { opts: line, handle });
      }
    }
  }

  destroy(): void {
    this.container.removeEventListener("pointerdown", this.handlePointerDown, { capture: true });
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    for (const entry of this.lines.values()) this.series.removePriceLine(entry.handle);
    this.lines.clear();
  }

  private handlePointerDown = (e: PointerEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const y = e.clientY - rect.top;

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

    if (bestId) {
      this.draggingId = bestId;
      this.container.style.cursor = "ns-resize";
      e.preventDefault();
      e.stopPropagation(); // block the chart's own pan handler from also reacting to this pointerdown
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.draggingId) return;
    const entry = this.lines.get(this.draggingId);
    if (!entry) return;

    const rect = this.container.getBoundingClientRect();
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const price = this.series.coordinateToPrice(y as Coordinate);
    if (price == null) return;

    entry.handle.applyOptions({ price });
    entry.opts = { ...entry.opts, price };
    this.onDrag(this.draggingId, price);
  };

  private handlePointerUp = (): void => {
    if (!this.draggingId) return;
    const entry = this.lines.get(this.draggingId);
    const id = this.draggingId;
    this.draggingId = null;
    this.container.style.cursor = "";
    if (entry) this.onDragEnd(id, entry.opts.price);
  };
}
