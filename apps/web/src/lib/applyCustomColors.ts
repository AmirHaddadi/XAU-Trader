import type { ThemeColorTokens } from "@xau-trader/protocol";

// The 11 CSS custom properties globals.css defines per theme — every
// themeable color in the app routes through one of these (chart colors via
// getComputedStyle in lib/theme.ts, everything else via Tailwind's
// `@theme inline` mapping or a direct `var(--color-x)`).
export const COLOR_TOKEN_VARS: Record<keyof ThemeColorTokens, string> = {
  background: "--color-background",
  card: "--color-card",
  cardAlt: "--color-card-alt",
  border: "--color-border",
  textPrimary: "--color-text-primary",
  textMuted: "--color-text-muted",
  accent: "--color-accent",
  buy: "--color-buy",
  sell: "--color-sell",
  warning: "--color-warning",
  chartGrid: "--color-chart-grid",
  candleWickUp: "--color-candle-wick-up",
  candleWickDown: "--color-candle-wick-down",
};

const ALL_TOKEN_KEYS = Object.keys(COLOR_TOKEN_VARS) as (keyof ThemeColorTokens)[];

// Applies a theme's color overrides as inline styles on the document root —
// inline style naturally wins over the `:root`/`:root[data-theme=light]`
// stylesheet rules in globals.css (no !important needed), and
// getComputedStyle (used by lib/theme.ts for the canvas-rendered chart, and
// implicitly by every DOM element already reading `var(--color-x)`) resolves
// inline overrides for free — no other code needs to change to pick this up.
//
// Always clears every one of the 11 tokens first, then re-applies only the
// current theme's overrides — otherwise a Dark-only override could leak
// into Light after a theme switch (inline styles don't know which
// stylesheet rule "should" apply, they just always win).
export function applyCustomColors(overrides: Partial<ThemeColorTokens> | undefined): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  for (const key of ALL_TOKEN_KEYS) {
    const value = overrides?.[key];
    if (value) root.style.setProperty(COLOR_TOKEN_VARS[key], value);
    else root.style.removeProperty(COLOR_TOKEN_VARS[key]);
  }
}
