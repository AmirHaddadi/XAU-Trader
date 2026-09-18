// Small shared hex/RGB helpers — used by the SL/TP price-line hover/drag
// color animation (priceLineDrag.ts) and by the Settings color picker
// (ColorSettings.tsx), so the two never drift on parsing/formatting rules.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex.trim());
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex; // not a plain #rrggbb (e.g. already a CSS var/named color) — leave as-is rather than guess
  return rgbToHex({ r: rgb.r + (255 - rgb.r) * amount, g: rgb.g + (255 - rgb.g) * amount, b: rgb.b + (255 - rgb.b) * amount });
}
