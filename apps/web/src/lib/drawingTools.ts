import type { Coordinate, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { Drawing, DrawingPoint, DrawingTool } from "@xau-trader/protocol";

const SVG_NS = "http://www.w3.org/2000/svg";
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
const HIT_TOLERANCE_PX = 6;

interface Px {
  x: number;
  y: number;
}

// Hand-rolled drawing tools (trendline / horizontal ray / Fibonacci
// retracement) rendered as an absolutely-positioned SVG overlay on top of
// the chart — lightweight-charts (the free library) has no built-in
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
  private selectedId: string | null = null;

  private onCreated: (drawing: Drawing) => void = () => {};
  private onSelectedChange: (id: string | null) => void = () => {};

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
    this.chart.timeScale().subscribeVisibleTimeRangeChange(this.render);
    window.addEventListener("resize", this.render);
  }

  setCallbacks(onCreated: (drawing: Drawing) => void, onSelectedChange: (id: string | null) => void): void {
    this.onCreated = onCreated;
    this.onSelectedChange = onSelectedChange;
  }

  setDrawings(drawings: Drawing[]): void {
    this.drawings = drawings;
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

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedId);
    this.selectedId = null;
    this.onSelectedChange(null);
    this.render();
  }

  destroy(): void {
    this.container.removeEventListener("click", this.handleClick, { capture: true });
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.render);
    window.removeEventListener("resize", this.render);
    this.svg.remove();
  }

  private toPoint(clientX: number, clientY: number): DrawingPoint | null {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const time = this.chart.timeScale().coordinateToTime(x);
    const price = this.series.coordinateToPrice(y as Coordinate);
    if (time == null || price == null) return null;
    return { time: time as unknown as number, price };
  }

  private toPixel(point: DrawingPoint): Px | null {
    const x = this.chart.timeScale().timeToCoordinate(point.time as unknown as Time);
    const y = this.series.priceToCoordinate(point.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  private handleClick = (e: MouseEvent): void => {
    if (!this.activeTool) {
      this.handleSelectClick(e);
      return;
    }
    const point = this.toPoint(e.clientX, e.clientY);
    if (!point) return;

    e.preventDefault();
    e.stopPropagation();

    if (this.activeTool === "ray") {
      this.finalize({ id: newId(), tool: "ray", points: [point] });
      return;
    }

    this.pendingPoints.push(point);
    if (this.pendingPoints.length === 2) {
      this.finalize({ id: newId(), tool: this.activeTool, points: this.pendingPoints });
    } else {
      this.render();
    }
  };

  private handleSelectClick = (e: MouseEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const clickPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = this.drawings.find((d) => this.hitTest(d, clickPx));
    if (hit) {
      e.stopPropagation();
      this.selectedId = hit.id;
      this.onSelectedChange(hit.id);
      this.render();
    } else if (this.selectedId) {
      this.selectedId = null;
      this.onSelectedChange(null);
      this.render();
    }
  };

  private hitTest(drawing: Drawing, px: Px): boolean {
    const pts = drawing.points.map((p) => this.toPixel(p)).filter((p): p is Px => p != null);
    if (pts.length === 0) return false;
    if (drawing.tool === "ray") {
      const [a] = pts;
      const paneWidth = this.chart.paneSize().width;
      return distanceToSegment(px, a, { x: paneWidth, y: a.y }) <= HIT_TOLERANCE_PX;
    }
    if (pts.length < 2) return false;
    const [a, b] = pts;
    if (drawing.tool === "trendline") return distanceToSegment(px, a, b) <= HIT_TOLERANCE_PX;
    // fib: hit-test against any of its horizontal level lines
    const paneWidth = this.chart.paneSize().width;
    const x0 = Math.min(a.x, b.x);
    for (const level of FIB_LEVELS) {
      const y = a.y + (b.y - a.y) * level;
      if (distanceToSegment(px, { x: x0, y }, { x: paneWidth, y }) <= HIT_TOLERANCE_PX) return true;
    }
    return false;
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
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#d97757";

    for (const drawing of this.drawings) {
      this.renderDrawing(drawing, accent, drawing.id === this.selectedId, paneWidth);
    }

    // Live preview while placing the 2nd point of a trendline/fib.
    if (this.activeTool && this.activeTool !== "ray" && this.pendingPoints.length === 1 && this.previewPoint) {
      this.renderDrawing(
        { id: "__preview", tool: this.activeTool, points: [this.pendingPoints[0], this.previewPoint] },
        accent,
        false,
        paneWidth,
        true,
      );
    }
  };

  private renderDrawing(drawing: Drawing, accent: string, selected: boolean, paneWidth: number, isPreview = false): void {
    const pts = drawing.points.map((p) => this.toPixel(p)).filter((p): p is Px => p != null);
    if (pts.length === 0) return;
    const strokeWidth = selected ? 2.5 : 1.5;
    const opacity = isPreview ? 0.6 : 1;

    if (drawing.tool === "ray") {
      const [a] = pts;
      this.line(a.x, a.y, paneWidth, a.y, accent, strokeWidth, opacity);
      return;
    }
    if (pts.length < 2) return;
    const [a, b] = pts;

    if (drawing.tool === "trendline") {
      this.line(a.x, a.y, b.x, b.y, accent, strokeWidth, opacity);
      return;
    }

    // fib retracement
    const x0 = Math.min(a.x, b.x);
    const priceA = drawing.points[0].price;
    const priceB = drawing.points[1].price;
    for (const level of FIB_LEVELS) {
      const y = a.y + (b.y - a.y) * level;
      const price = priceA + (priceB - priceA) * level;
      this.line(x0, y, paneWidth, y, accent, level === 0 || level === 1 ? strokeWidth : 1, opacity * (level === 0.5 ? 1 : 0.7));
      this.text(x0 + 4, y - 3, `${(level * 100).toFixed(1)}% — ${price.toFixed(2)}`, accent, opacity);
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
