// Zoom/loupe preview box shown top-left of the chart while a drawing tool
// is active (Amir: "وقتی ابزاری روی چارت در حال کشیده شدن است... زوم دقیق
// همون محدوده‌ای که موس داره کار میکنه رو نشون بده"). lightweight-charts
// renders each pane onto a real <canvas> element (confirmed — see
// lib/theme.ts's CSS-var gotcha, same underlying fact), so this just crops
// + scales a region of that canvas into a small fixed preview canvas
// centered on the cursor — no lightweight-charts API involved, purely
// pixel-level and read-only.
const BOX_WIDTH = 160;
const BOX_HEIGHT = 110;
const ZOOM = 4;

export class ChartMagnifierController {
  private container: HTMLElement;
  private box: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private active = false;
  private sourceCanvas: HTMLCanvasElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.box = document.createElement("div");
    Object.assign(this.box.style, {
      position: "absolute",
      top: "8px",
      left: "8px",
      zIndex: "20",
      width: `${BOX_WIDTH}px`,
      height: `${BOX_HEIGHT}px`,
      border: "1px solid var(--color-border)",
      borderRadius: "8px",
      overflow: "hidden",
      background: "var(--color-card)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      display: "none",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    this.canvas = document.createElement("canvas");
    this.canvas.width = BOX_WIDTH;
    this.canvas.height = BOX_HEIGHT;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.box.appendChild(this.canvas);
    container.appendChild(this.box);

    container.addEventListener("pointermove", this.handleMove);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.box.style.display = active ? "block" : "none";
    this.sourceCanvas = active ? this.findSourceCanvas() : null;
  }

  destroy(): void {
    this.container.removeEventListener("pointermove", this.handleMove);
    this.box.remove();
  }

  // The largest-area <canvas> under the container is the main candlestick
  // pane (price/time-scale canvases, if any, are much smaller) — cheap
  // heuristic, re-run once per setActive(true) rather than per pointermove.
  private findSourceCanvas(): HTMLCanvasElement | null {
    let best: HTMLCanvasElement | null = null;
    let bestArea = 0;
    for (const c of Array.from(this.container.querySelectorAll("canvas"))) {
      if (c === this.canvas) continue;
      const area = c.width * c.height;
      if (area > bestArea) {
        bestArea = area;
        best = c;
      }
    }
    return best;
  }

  private handleMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (!this.sourceCanvas) this.sourceCanvas = this.findSourceCanvas();
    const source = this.sourceCanvas;
    if (!source) return;

    const srcRect = source.getBoundingClientRect();
    if (srcRect.width === 0 || srcRect.height === 0) return;
    // Canvas backing-store pixels can differ from its CSS size (devicePixelRatio) — scale accordingly.
    const scaleX = source.width / srcRect.width;
    const scaleY = source.height / srcRect.height;
    const cx = (e.clientX - srcRect.left) * scaleX;
    const cy = (e.clientY - srcRect.top) * scaleY;

    const sw = (BOX_WIDTH / ZOOM) * scaleX;
    const sh = (BOX_HEIGHT / ZOOM) * scaleY;
    const sx = Math.max(0, Math.min(source.width - sw, cx - sw / 2));
    const sy = Math.max(0, Math.min(source.height - sh, cy - sh / 2));

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false; // crisp candle edges at 4x, not a blurred upscale
    ctx.clearRect(0, 0, BOX_WIDTH, BOX_HEIGHT);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, BOX_WIDTH, BOX_HEIGHT);

    // Center crosshair — exactly where the next click will land.
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#d97757";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BOX_WIDTH / 2, 0);
    ctx.lineTo(BOX_WIDTH / 2, BOX_HEIGHT);
    ctx.moveTo(0, BOX_HEIGHT / 2);
    ctx.lineTo(BOX_WIDTH, BOX_HEIGHT / 2);
    ctx.stroke();
  };
}
