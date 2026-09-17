"use client";

// lightweight-charts renders on <canvas> and does not resolve CSS custom
// properties the way a DOM element's `style` would — passing "var(--x)"
// straight into its color options is a silent no-op. This resolves the
// *actual* computed value at call time instead, so canvas-facing code
// always gets a real color string, and can be re-read after a theme
// switch (data-theme flips synchronously, so a read right after covers it).
export function resolveCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ChartPalette {
  background: string;
  border: string;
  textMuted: string;
  buy: string;
  sell: string;
  accent: string;
  grid: string;
}

export function readChartPalette(): ChartPalette {
  return {
    background: resolveCssVar("--color-card"),
    border: resolveCssVar("--color-border"),
    textMuted: resolveCssVar("--color-text-muted"),
    buy: resolveCssVar("--color-buy"),
    sell: resolveCssVar("--color-sell"),
    accent: resolveCssVar("--color-accent"),
    grid: resolveCssVar("--color-chart-grid"),
  };
}
