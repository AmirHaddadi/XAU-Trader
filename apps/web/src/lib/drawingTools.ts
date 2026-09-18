import type { Coordinate, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { Bar, Drawing, DrawingPoint, DrawingTool } from "@xau-trader/protocol";
import { snapPoint } from "./magnet";
import { timeframeSeconds } from "./timeframes";

const SVG_NS = "http://www.w3.org/2000/svg";
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
const HIT_TOLERANCE_PX = 6;
const MAGNET_TOLERANCE_PX = 10;
// A pointer down->up with less movement than this, while in select mode, is
// treated as a plain click-to-select rather than a marquee drag.
const CLICK_DRAG_THRESHOLD_PX = 4;
// ray (horizontal line) and vline (vertical line) are "complete" the moment
// a single point is placed — no second click needed, matching Amir's "که
// کامل هست و نیاز به این نداره" (a tool that's already complete on its own).
const SINGLE_CLICK_TOOLS = new Set<DrawingTool>(["ray", "vline"]);

interface Px {
  x: number;
  y: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Hand-rolled drawing tools (trendline / horizontal line / vertical line /
// fib retracement / box) rendered as an absolutely-positioned SVG overlay on
// top of the chart — lightweight-charts (the free library) has no built-in
// drawing toolset, unlike TradingView's own site or their paid Advanced
// Charting Library. Re-derives pixel positions from each Drawing's
// time/price anchors on every visible-range change (pan/zoom) rather than
// caching pixel coordinates, so drawings track the chart correctly instead
// of drifting.
export class DrawingLayerController {
  private chart: IChartApi;
  private series: ISeriesApi<"Candlestick">;
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private drawings: Drawing[] = [];
  private activeTool: DrawingTool | null = null;
  private pendingPoints: DrawingPoint[] = [];
  private previewPoint: DrawingPoint | null = null;
  private selectedIds = new Set<string>();
  private bars: Bar[] = [];
  private magnetEnabled = false;
  private tfSeconds = 60;
  // Selector-tool state (see setSelectMode) — box/marquee multi-select,
  // separate from the plain single-click select that's always available
  // whenever no drawing tool is active.
  private selectMode = false;
  private marqueeStart: Px | null = null;
  private marqueeCurrent: Px | null = null;
  private marqueeAdditive = false;

  private onCreated: (drawing: Drawing) => void = () => {};
  private onSelectedChange: (ids: string[]) => void = () => {};
  private onDeleteRequested: () => void = () => {};

  constructor(chart: IChartApi, series: ISeriesApi<"Candlestick">, container: HTMLElement) {
    this.chart = chart;
    this.series = series;
    this.container = container;

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.style.position = "absolute";
    this.svg.style.inset = "0";
    this.svg.style.width = "100%";
    this.svg.style.height = "100%";
    // Always "none": hit-testing is done manually in JS against `drawings`
    // (see handleSelectClick/hitTest) via a capture-phase listener on
    // `container`, not native SVG element targeting — so the overlay must
    // never intercept pointer targeting itself, or it would block the
    // chart's own pan/zoom and the SL/TP price-line drag controller
    // underneath for every pixel of the chart, drawn or not.
    this.svg.style.pointerEvents = "none";
    container.style.position = container.style.position || "relative";
    container.appendChild(this.svg);

    container.addEventListener("click", this.handleClick, { capture: true });
    container.addEventListener("pointermove", this.handlePointerMove);
    container.addEventListener("pointerdown", this.handleSelectPointerDown, { capture: true });
    window.addEventListener("pointermove", this.handleSelectPointerMove);
    window.addEventListener("pointerup", this.handleSelectPointerUp);
    window.addEventListener("keydown", this.handleKeyDown);
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.render);
    window.addEventListener("resize", this.render);
  }

  setCallbacks(onCreated: (drawing: Drawing) => void, onSelectedChange: (ids: string[]) => void, onDeleteRequested: () => void): void {
    this.onCreated = onCreated;
    this.onSelectedChange = onSelectedChange;
    this.onDeleteRequested = onDeleteRequested;
  }

  setDrawings(drawings: Drawing[]): void {
    this.drawings = drawings;
    // Deleting (or a settings resync) can drop a drawing that was selected —
    // keep the selection set honest so a stale id never lingers and the
    // toolbar's "hasSelection"/count stays accurate.
    const validIds = new Set(drawings.map((d) => d.id));
    let changed = false;
    for (const id of this.selectedIds) {
      if (!validIds.has(id)) {
        this.selectedIds.delete(id);
        changed = true;
      }
    }
    if (changed) this.onSelectedChange(Array.from(this.selectedIds));
    this.render();
  }

  // Kept in sync with LiveChart's `bars` prop — used both by the magnet
  // snap (lib/magnet.ts) and by the coordinate-extrapolation fallback in
  // toPoint() below (see there for why it's needed).
  setBars(bars: Bar[]): void {
    this.bars = bars;
  }

  setMagnetEnabled(enabled: boolean): void {
    this.magnetEnabled = enabled;
  }

  setTimeframe(tf: string): void {
    this.tfSeconds = timeframeSeconds(tf);
  }

  // Explicit "Selector" tool (see ChartToolbar) — box/marquee multi-select
  // over the chart. Disabling it cancels any marquee in progress.
  setSelectMode(enabled: boolean): void {
    this.selectMode = enabled;
    if (!enabled) {
      this.marqueeStart = null;
      this.marqueeCurrent = null;
    }
    this.render();
  }

  // null = selection/pan mode (clicking a drawing selects it instead of
  // starting a new one).
  setActiveTool(tool: DrawingTool | null): void {
    this.activeTool = tool;
    this.pendingPoints = [];
    this.previewPoint = null;
    this.render();
  }

  // Re-renders against whatever's already loaded — needed beyond the
  // pan/zoom subscription above because a live price tick can rescale the
  // price axis (new high/low outside the current visible range) without
  // ever firing a *time*-range change, which used to leave every drawing's
  // y-coordinate stale until the user happened to pan/zoom. Call this
  // whenever a live bar update lands (see LiveChart.tsx).
  refresh(): void {
    this.render();
  }

  destroy(): void {
    this.container.removeEventListener("click", this.handleClick, { capture: true });
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.container.removeEventListener("pointerdown", this.handleSelectPointerDown, { capture: true });
    window.removeEventListener("pointermove", this.handleSelectPointerMove);
    window.removeEventListener("pointerup", this.handleSelectPointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.render);
    window.removeEventListener("resize", this.render);
    this.svg.remove();
  }

  private toPoint(clientX: number, clientY: number): DrawingPoint | null {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const price = this.series.coordinateToPrice(y as Coordinate);
    if (price == null) return null;

    const coordTime = this.chart.timeScale().coordinateToTime(x);
    const time: number | null = coordTime != null ? (coordTime as unknown as number) : this.extrapolateTime(x);
    if (time == null) return null;

    const point: DrawingPoint = { time, price };
    return this.magnetEnabled ? snapPoint(point, this.bars, MAGNET_TOLERANCE_PX, (p) => this.series.priceToCoordinate(p)) : point;
  }

  // coordinateToTime() returns null for any x past the last loaded bar (the
  // right-offset whitespace) or otherwise outside its resolvable range —
  // confirmed root cause of "can't draw past the last candle" (Amir's bug
  // report: "نمیشه نامحدود و نامتناهی رسم کرد"). coordinateToLogical()
  // extrapolates fine beyond the data, and logical position 1:1 matches the
  // loaded bars' array index, so the remaining step is converting a logical
  // offset from the last bar into a time offset using the current
  // timeframe's bar spacing. Approximate (ignores session/weekend gaps) but
  // this is a drawing anchor, not a trade price — doesn't need to be exact.
  private extrapolateTime(x: number): number | null {
    if (this.bars.length === 0) return null;
    const logical = this.chart.timeScale().coordinateToLogical(x);
    if (logical == null) return null;
    const lastIndex = this.bars.length - 1;
    const stepsBeyond = logical - lastIndex;
    return this.bars[lastIndex].time + stepsBeyond * this.tfSeconds;
  }

  private toPixel(point: DrawingPoint): Px | null {
    const x = this.chart.timeScale().timeToCoordinate(point.time as unknown as Time);
    const y = this.series.priceToCoordinate(point.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  // True whenever a pointer gesture should be treated as select/marquee
  // rather than panning or tool-placement: the explicit Selector tool, or
  // Ctrl/Cmd held as a temporary shortcut for the same thing (Amir: "وقتی
  // کنترل نگه داشته میشود و موس درگ میکنه همون کار سلکتور رو انجام بده").
  // Never while an actual drawing tool is being placed — Ctrl shouldn't
  // block finishing a trend line just because it's held incidentally.
  private isMultiSelectGesture(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
    return !this.activeTool && (this.selectMode || e.ctrlKey || e.metaKey);
  }

  private handleClick = (e: MouseEvent): void => {
    // Selector-mode (or Ctrl/Cmd-held) single clicks are fully owned by the
    // pointerdown/up pair below (handleSelectPointerUp) — this "click"
    // event fires from the exact same gesture and would otherwise
    // double-handle it.
    if (this.isMultiSelectGesture(e)) return;

    if (!this.activeTool) {
      this.handleSelectClick(e);
      return;
    }
    const point = this.toPoint(e.clientX, e.clientY);
    if (!point) return;

    e.preventDefault();
    e.stopPropagation();

    if (SINGLE_CLICK_TOOLS.has(this.activeTool)) {
      this.finalize({ id: newId(), tool: this.activeTool, points: [point] });
      return;
    }

    this.pendingPoints.push(point);
    if (this.pendingPoints.length === 2) {
      this.finalize({ id: newId(), tool: this.activeTool, points: this.pendingPoints });
    } else {
      this.render();
    }
  };

  // Plain pan-mode single-select (no Selector tool active) — click a
  // drawing to select just it, click empty space to clear.
  private handleSelectClick = (e: MouseEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const clickPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = this.drawings.find((d) => this.hitTest(d, clickPx));
    if (hit) {
      e.stopPropagation();
      this.selectedIds = new Set([hit.id]);
      this.onSelectedChange(Array.from(this.selectedIds));
      this.render();
    } else if (this.selectedIds.size > 0) {
      this.selectedIds.clear();
      this.onSelectedChange([]);
      this.render();
    }
  };

  // Intercepted in capture phase, same reasoning as priceLineDrag.ts: block
  // the chart's own pan gesture for the duration of a marquee drag. Active
  // while the explicit Selector tool is on, or Ctrl/Cmd is held (see
  // isMultiSelectGesture) — plain pan mode's single click
  // (handleClick/handleSelectClick above) is untouched so ordinary panning
  // still works the rest of the time.
  private handleSelectPointerDown = (e: PointerEvent): void => {
    if (!this.isMultiSelectGesture(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.container.getBoundingClientRect();
    this.marqueeStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.marqueeCurrent = this.marqueeStart;
    // Shift adds to the existing selection; Ctrl/Cmd alone (or the
    // Selector tool) replaces it, matching most desktop apps' convention.
    this.marqueeAdditive = e.shiftKey;
    this.render();
  };

  private handleSelectPointerMove = (e: PointerEvent): void => {
    if (!this.marqueeStart) return;
    const rect = this.container.getBoundingClientRect();
    this.marqueeCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.render();
  };

  private handleSelectPointerUp = (): void => {
    if (!this.marqueeStart || !this.marqueeCurrent) return;
    const start = this.marqueeStart;
    const end = this.marqueeCurrent;
    const additive = this.marqueeAdditive;
    this.marqueeStart = null;
    this.marqueeCurrent = null;

    const dragDist = Math.hypot(end.x - start.x, end.y - start.y);
    if (dragDist < CLICK_DRAG_THRESHOLD_PX) {
      this.selectAtPoint(end, additive);
    } else {
      const rectSel = normalizeRect(start, end);
      const hitIds = this.drawings.filter((d) => this.intersectsRect(d, rectSel)).map((d) => d.id);
      if (additive) {
        for (const id of hitIds) this.selectedIds.add(id);
      } else {
        this.selectedIds = new Set(hitIds);
      }
      this.onSelectedChange(Array.from(this.selectedIds));
    }
    this.render();
  };

  private selectAtPoint(px: Px, additive: boolean): void {
    const hit = this.drawings.find((d) => this.hitTest(d, px));
    if (!hit) {
      if (!additive && this.selectedIds.size > 0) {
        this.selectedIds.clear();
        this.onSelectedChange([]);
      }
      return;
    }
    if (additive) {
      if (this.selectedIds.has(hit.id)) this.selectedIds.delete(hit.id);
      else this.selectedIds.add(hit.id);
    } else {
      this.selectedIds = new Set([hit.id]);
    }
    this.onSelectedChange(Array.from(this.selectedIds));
  }

  // Physical Delete/Backspace key — deletes every currently-selected
  // drawing. Guarded against firing while the user is typing in an unrelated
  // form field elsewhere on the page (the chart, and this listener, stay
  // mounted across tab switches — see LiveChart's "always mounted, hidden"
  // pattern — so e.g. the Settings color hex input needs protecting here).
  // Backspace is included for Mac keyboards, whose "delete" key sends a
  // Backspace key event.
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (this.selectedIds.size === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const tag = active?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable) return;
    e.preventDefault();
    this.onDeleteRequested();
  };

  private hitTest(drawing: Drawing, px: Px): boolean {
    const pts = drawing.points.map((p) => this.toPixel(p)).filter((p): p is Px => p != null);
    if (pts.length === 0) return false;

    if (drawing.tool === "ray") {
      const [a] = pts;
      const paneWidth = this.chart.paneSize().width;
      return distanceToSegment(px, { x: 0, y: a.y }, { x: paneWidth, y: a.y }) <= HIT_TOLERANCE_PX;
    }
    if (drawing.tool === "vline") {
      const [a] = pts;
      const paneHeight = this.chart.paneSize().height;
      return distanceToSegment(px, { x: a.x, y: 0 }, { x: a.x, y: paneHeight }) <= HIT_TOLERANCE_PX;
    }
    if (pts.length < 2) return false;
    const [a, b] = pts;

    if (drawing.tool === "trendline") return distanceToSegment(px, a, b) <= HIT_TOLERANCE_PX;

    if (drawing.tool === "box") {
      const x0 = Math.min(a.x, b.x) - HIT_TOLERANCE_PX;
      const x1 = Math.max(a.x, b.x) + HIT_TOLERANCE_PX;
      const y0 = Math.min(a.y, b.y) - HIT_TOLERANCE_PX;
      const y1 = Math.max(a.y, b.y) + HIT_TOLERANCE_PX;
      return px.x >= x0 && px.x <= x1 && px.y >= y0 && px.y <= y1;
    }

    // fib: hit-test against any of its horizontal level lines
    const paneWidth = this.chart.paneSize().width;
    const x0 = Math.min(a.x, b.x);
    for (const level of FIB_LEVELS) {
      const y = a.y + (b.y - a.y) * level;
      if (distanceToSegment(px, { x: x0, y }, { x: paneWidth, y }) <= HIT_TOLERANCE_PX) return true;
    }
    return false;
  }

  // Axis-aligned bounding box per drawing, used only by the marquee
  // intersection test — ray/vline are pane-clamped on their infinite axis
  // (matching how they actually render), fib's box extends to the pane's
  // right edge like its level lines do, everything else is just its two
  // anchor points' box.
  private boundingBox(drawing: Drawing): Rect | null {
    const pts = drawing.points.map((p) => this.toPixel(p)).filter((p): p is Px => p != null);
    if (pts.length === 0) return null;
    const paneWidth = this.chart.paneSize().width;
    const paneHeight = this.chart.paneSize().height;

    if (drawing.tool === "ray") {
      const [a] = pts;
      return { x0: 0, y0: a.y, x1: paneWidth, y1: a.y };
    }
    if (drawing.tool === "vline") {
      const [a] = pts;
      return { x0: a.x, y0: 0, x1: a.x, y1: paneHeight };
    }
    if (pts.length < 2) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x1 = drawing.tool === "fib" ? paneWidth : Math.max(...xs);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1, y1: Math.max(...ys) };
  }

  private intersectsRect(drawing: Drawing, r: Rect): boolean {
    const bb = this.boundingBox(drawing);
    if (!bb) return false;
    return bb.x0 <= r.x1 && bb.x1 >= r.x0 && bb.y0 <= r.y1 && bb.y1 >= r.y0;
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.activeTool || this.pendingPoints.length === 0) return;
    const point = this.toPoint(e.clientX, e.clientY);
    if (!point) return;
    this.previewPoint = point;
    this.render();
  };

  private finalize(drawing: Drawing): void {
    this.pendingPoints = [];
    this.previewPoint = null;
    // Return to select/pan mode after each drawing — one shot per tool
    // pick, same as most charting tools, and avoids a subtle conflict
    // where an active tool would swallow a click meant to drag an SL/TP
    // price line instead. onCreated's consumer (the toolbar) is expected
    // to reset its own "active tool" button state to match.
    this.activeTool = null;
    this.onCreated(drawing);
  }

  private render = (): void => {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    const paneWidth = this.chart.paneSize().width;
    const defaultColor = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#d97757";

    for (const drawing of this.drawings) {
      this.renderDrawing(drawing, drawing.color || defaultColor, this.selectedIds.has(drawing.id), paneWidth);
    }

    // Live preview while placing the 2nd point of a trendline/box/fib
    // (ray/vline finalize on the first click — see SINGLE_CLICK_TOOLS —
    // so pendingPoints never holds a partial state for them).
    if (this.activeTool && this.pendingPoints.length === 1 && this.previewPoint) {
      this.renderDrawing(
        { id: "__preview", tool: this.activeTool, points: [this.pendingPoints[0], this.previewPoint] },
        defaultColor,
        false,
        paneWidth,
        true,
      );
    }

    if (this.marqueeStart && this.marqueeCurrent) {
      const r = normalizeRect(this.marqueeStart, this.marqueeCurrent);
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(r.x0));
      rect.setAttribute("y", String(r.y0));
      rect.setAttribute("width", String(r.x1 - r.x0));
      rect.setAttribute("height", String(r.y1 - r.y0));
      rect.setAttribute("fill", defaultColor);
      rect.setAttribute("fill-opacity", "0.08");
      rect.setAttribute("stroke", defaultColor);
      rect.setAttribute("stroke-width", "1");
      rect.setAttribute("stroke-dasharray", "4 3");
      this.svg.appendChild(rect);
    }
  };

  private renderDrawing(drawing: Drawing, color: string, selected: boolean, paneWidth: number, isPreview = false): void {
    const pts = drawing.points.map((p) => this.toPixel(p)).filter((p): p is Px => p != null);
    if (pts.length === 0) return;
    const strokeWidth = selected ? 2.5 : 1.5;
    const opacity = isPreview ? 0.6 : 1;

    if (drawing.tool === "ray") {
      // Full-width horizontal line, not a one-directional ray — see the
      // extrapolateTime()/toPoint() comment above for the underlying bug
      // this replaces; the y (price) side never had the problem.
      const [a] = pts;
      this.line(0, a.y, paneWidth, a.y, color, strokeWidth, opacity);
      return;
    }
    if (drawing.tool === "vline") {
      const [a] = pts;
      const paneHeight = this.chart.paneSize().height;
      this.line(a.x, 0, a.x, paneHeight, color, strokeWidth, opacity);
      return;
    }
    if (pts.length < 2) return;
    const [a, b] = pts;

    if (drawing.tool === "trendline") {
      this.line(a.x, a.y, b.x, b.y, color, strokeWidth, opacity);
      return;
    }

    if (drawing.tool === "box") {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(Math.min(a.x, b.x)));
      rect.setAttribute("y", String(Math.min(a.y, b.y)));
      rect.setAttribute("width", String(Math.abs(b.x - a.x)));
      rect.setAttribute("height", String(Math.abs(b.y - a.y)));
      rect.setAttribute("fill", color);
      rect.setAttribute("fill-opacity", String(opacity * 0.12));
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", String(strokeWidth));
      rect.setAttribute("opacity", String(opacity));
      this.svg.appendChild(rect);
      return;
    }

    // fib retracement
    const x0 = Math.min(a.x, b.x);
    const priceA = drawing.points[0].price;
    const priceB = drawing.points[1].price;
    for (const level of FIB_LEVELS) {
      const y = a.y + (b.y - a.y) * level;
      const price = priceA + (priceB - priceA) * level;
      this.line(x0, y, paneWidth, y, color, level === 0 || level === 1 ? strokeWidth : 1, opacity * (level === 0.5 ? 1 : 0.7));
      this.text(x0 + 4, y - 3, `${(level * 100).toFixed(1)}% — ${price.toFixed(2)}`, color, opacity);
    }
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string, width: number, opacity: number): void {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", String(x1));
    el.setAttribute("y1", String(y1));
    el.setAttribute("x2", String(x2));
    el.setAttribute("y2", String(y2));
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", String(width));
    el.setAttribute("opacity", String(opacity));
    this.svg.appendChild(el);
  }

  private text(x: number, y: number, content: string, color: string, opacity: number): void {
    const el = document.createElementNS(SVG_NS, "text");
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("fill", color);
    el.setAttribute("font-size", "10");
    el.setAttribute("opacity", String(opacity));
    el.textContent = content;
    this.svg.appendChild(el);
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function normalizeRect(a: Px, b: Px): Rect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

function distanceToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}
