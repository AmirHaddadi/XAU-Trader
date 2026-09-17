import { LineStyle, type Coordinate, type IPriceLine, type ISeriesApi, type LineWidth } from "lightweight-charts";

export interface DraggableLine {
  id: string;
  price: number;
  color: string;
  title: string;
  draggable: boolean;
  dashed?: boolean;
}

const HIT_TOLERANCE_PX = 8;
const HOVER_TRANSITION_MS = 150;
const HOVER_LIGHTEN = 0.35; // 0..1, how much closer to white the hover/drag color moves
const DRAG_LIGHTEN = 0.55;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex; // not a plain #rrggbb (e.g. already a CSS var/named color) — leave as-is rather than guess
  const [r, g, b] = rgb.map((c) => Math.round(c + (255 - c) * amount));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

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
  private series: ISeriesApi<"Candlestick">;
  private container: HTMLElement;
  private lines = new Map<string, LineEntry>();
  private draggingId: string | null = null;
  private hoveredId: string | null = null;
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
    // Bubble is fine here — pure hover feedback, nothing to intercept.
    container.addEventListener("pointermove", this.handleHoverMove);
    container.addEventListener("pointerleave", this.handleHoverLeave);
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
      const r = fromRgb[0] + (toRgb[0] - fromRgb[0]) * eased;
      const g = fromRgb[1] + (toRgb[1] - fromRgb[1]) * eased;
      const b = fromRgb[2] + (toRgb[2] - fromRgb[2]) * eased;
      entry.handle.applyOptions({
        color: `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`,
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
    // Settle into "hover" depth if the pointer is still over the line
    // (almost certainly true right after a drag release), else "none".
    this.setDepth(id, this.hoveredId === id ? "hover" : "none");
    this.container.style.cursor = this.hoveredId ? "ns-resize" : "";
    if (entry) this.onDragEnd(id, entry.opts.price);
  };

  private handleHoverMove = (e: PointerEvent): void => {
    if (this.draggingId) return; // mid-drag owns cursor/depth already
    const hitId = this.hitTest(e.clientY);
    if (hitId === this.hoveredId) return;

    if (this.hoveredId) this.setDepth(this.hoveredId, "none");
    this.hoveredId = hitId;
    if (hitId) this.setDepth(hitId, "hover");
    this.container.style.cursor = hitId ? "ns-resize" : "";
  };

  private handleHoverLeave = (): void => {
    if (this.draggingId) return;
    if (this.hoveredId) this.setDepth(this.hoveredId, "none");
    this.hoveredId = null;
    this.container.style.cursor = "";
  };
}
