"use client";

import { useEffect, useState } from "react";
import type { AppTheme, Settings, ThemeColorTokens } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRotateLeft, faCheck, faPalette } from "@fortawesome/free-solid-svg-icons";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { hexToRgb, isValidHex, rgbToHex } from "@/lib/color";

// The app's two shipped palettes (globals.css) — used as the "what you get
// if you clear this override" reference value for each token, and as the
// live-preview base before any pending edits are layered on top. Kept as
// plain constants (not read via getComputedStyle) since the palette being
// edited isn't necessarily the one currently active in the DOM.
const DEFAULT_DARK: ThemeColorTokens = {
  background: "#1f1e1d",
  card: "#262522",
  cardAlt: "#2e2c28",
  border: "#3d3a35",
  textPrimary: "#f5f3ee",
  textMuted: "#c6c3b8",
  accent: "#d97757",
  buy: "#56a87b",
  sell: "#d25a47",
  warning: "#d9a757",
  chartGrid: "#363531",
  candleWickUp: "#56a87b",
  candleWickDown: "#d25a47",
};

const DEFAULT_LIGHT: ThemeColorTokens = {
  background: "#faf9f5",
  card: "#ffffff",
  cardAlt: "#f0eee6",
  border: "#e5e2d9",
  textPrimary: "#1a1915",
  textMuted: "#6b675e",
  accent: "#d97757",
  buy: "#3e8e5a",
  sell: "#c15f3c",
  warning: "#b8863f",
  chartGrid: "#e9e7dd",
  candleWickUp: "#3e8e5a",
  candleWickDown: "#c15f3c",
};

const TOKEN_ORDER: (keyof ThemeColorTokens)[] = [
  "accent",
  "buy",
  "sell",
  "candleWickUp",
  "candleWickDown",
  "warning",
  "background",
  "card",
  "cardAlt",
  "border",
  "textPrimary",
  "textMuted",
  "chartGrid",
];

const TOKEN_LABEL_KEY: Record<keyof ThemeColorTokens, TranslationKey> = {
  accent: "colorAccent",
  buy: "colorBuy",
  sell: "colorSell",
  candleWickUp: "colorCandleWickUp",
  candleWickDown: "colorCandleWickDown",
  warning: "colorWarning",
  background: "colorBackground",
  card: "colorCard",
  cardAlt: "colorCardAlt",
  border: "colorBorder",
  textPrimary: "colorTextPrimary",
  textMuted: "colorTextMuted",
  chartGrid: "colorChartGrid",
};

interface ColorSettingsProps {
  appTheme: AppTheme;
  customColorsDark: Partial<ThemeColorTokens>;
  customColorsLight: Partial<ThemeColorTokens>;
  onUpdate: (partial: Partial<Settings>) => void;
}

// Fully modular per-theme color customization: edits are staged in local
// `pending` state (never touching the live app or persisted settings) so
// the preview panel below can reflect them instantly, and only committed
// (persisted via onUpdate -> settings.update, which also applies them
// live — see page.tsx's ThemeSync -> lib/applyCustomColors.ts) once the
// user clicks Apply. Restore Defaults is the one exception — a revert to a
// known-good state is safe to apply immediately.
export function ColorSettings({ appTheme, customColorsDark, customColorsLight, onUpdate }: ColorSettingsProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [editingTheme, setEditingTheme] = useState<AppTheme>(appTheme);
  const currentApplied = editingTheme === "dark" ? customColorsDark : customColorsLight;
  const [pending, setPending] = useState<Partial<ThemeColorTokens>>(currentApplied);
  const [openToken, setOpenToken] = useState<keyof ThemeColorTokens | null>(null);

  // Re-seed pending edits whenever the edited theme tab changes — switching
  // tabs discards unsaved edits for the previous one by design (nothing is
  // written until Apply).
  useEffect(() => {
    setPending(editingTheme === "dark" ? customColorsDark : customColorsLight);
    setOpenToken(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTheme]);

  const defaults = editingTheme === "dark" ? DEFAULT_DARK : DEFAULT_LIGHT;
  const resolved = (token: keyof ThemeColorTokens) => pending[token] ?? defaults[token];
  const dirty = JSON.stringify(pending) !== JSON.stringify(currentApplied);

  function setToken(token: keyof ThemeColorTokens, hex: string) {
    setPending((prev) => ({ ...prev, [token]: hex }));
  }

  function clearToken(token: keyof ThemeColorTokens) {
    setPending((prev) => {
      const next = { ...prev };
      delete next[token];
      return next;
    });
  }

  function handleApply() {
    onUpdate(editingTheme === "dark" ? { customColorsDark: pending } : { customColorsLight: pending });
    toast.show("success", t("colorsApplied"));
  }

  function handleCancel() {
    setPending(currentApplied);
    setOpenToken(null);
  }

  function handleRestoreDefaults() {
    setPending({});
    onUpdate(editingTheme === "dark" ? { customColorsDark: {} } : { customColorsLight: {} });
    toast.show("success", t("colorsRestored"));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <FontAwesomeIcon icon={faPalette} className="h-3.5 w-3.5 text-text-muted" />
          {t("colorSettingsTitle")}
        </h2>
        <div className="flex items-center gap-1 rounded border border-border p-0.5" role="group" aria-label={t("theme")}>
          {(["dark", "light"] as AppTheme[]).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setEditingTheme(th)}
              className="rounded px-2 py-1 text-xs font-medium transition-colors duration-150"
              style={{
                color: editingTheme === th ? "var(--color-text-primary)" : "var(--color-text-muted)",
                backgroundColor: editingTheme === th ? "var(--color-card-alt)" : "transparent",
              }}
            >
              {t(th === "dark" ? "themeDark" : "themeLight")}
            </button>
          ))}
        </div>
      </div>

      <ColorPreview colors={{ ...defaults, ...pending }} />

      <div className="flex flex-col divide-y divide-border rounded border border-border">
        {TOKEN_ORDER.map((token) => (
          <ColorRow
            key={token}
            label={t(TOKEN_LABEL_KEY[token])}
            value={resolved(token)}
            overridden={pending[token] != null}
            open={openToken === token}
            onToggle={() => setOpenToken(openToken === token ? null : token)}
            onChange={(hex) => setToken(token, hex)}
            onClear={() => clearToken(token)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleRestoreDefaults}
          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-text-muted transition-colors duration-150 hover:bg-card-alt"
        >
          <FontAwesomeIcon icon={faArrowRotateLeft} className="h-3 w-3" />
          {t("restoreDefaults")}
        </button>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-primary transition-colors duration-150 hover:bg-card-alt"
            >
              {t("cancel")}
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-150 hover:enabled:brightness-110 active:enabled:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
            {t("applyColors")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ColorRowProps {
  label: string;
  value: string;
  overridden: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (hex: string) => void;
  onClear: () => void;
}

// Hex text input + native color swatch + three R/G/B numeric inputs, all
// kept in sync through lib/color.ts's hexToRgb/rgbToHex — matches the
// task's explicit "هم امکان وارد کردن کد رنگی با # ... هم سلکتور rgb".
function ColorRow({ label, value, overridden, open, onToggle, onChange, onClear }: ColorRowProps) {
  const { t } = useI18n();
  const [hexDraft, setHexDraft] = useState(value);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  function commitHex(next: string) {
    setHexDraft(next);
    if (isValidHex(next)) onChange(next);
  }

  function commitRgb(channel: "r" | "g" | "b", raw: string) {
    const rgb = hexToRgb(hexDraft) ?? { r: 0, g: 0, b: 0 };
    const n = Math.max(0, Math.min(255, Number(raw) || 0));
    commitHex(rgbToHex({ ...rgb, [channel]: n }));
  }

  const rgb = hexToRgb(hexDraft) ?? { r: 0, g: 0, b: 0 };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-card-alt"
      >
        <span className="h-5 w-5 shrink-0 rounded border border-border" style={{ backgroundColor: value }} />
        <span className="flex-1 text-sm text-text-primary">{label}</span>
        {overridden && <span className="text-[10px] uppercase tracking-wide text-accent">{t("customized")}</span>}
        <span className="font-mono text-xs text-text-muted">{value}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border bg-card-alt/40 px-3 py-2 animate-fade-in-up">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-text-muted">
              #
              <input
                type="text"
                value={hexDraft.replace(/^#/, "")}
                onChange={(e) => commitHex(`#${e.target.value}`)}
                maxLength={6}
                className="w-24 rounded border border-border bg-card px-2 py-1 font-mono text-xs uppercase text-text-primary"
              />
            </label>
            <input
              type="color"
              value={isValidHex(hexDraft) ? hexDraft : value}
              onChange={(e) => commitHex(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            {(["r", "g", "b"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1 text-xs text-text-muted">
                {ch.toUpperCase()}
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[ch]}
                  onChange={(e) => commitRgb(ch, e.target.value)}
                  className="w-14 rounded border border-border bg-card px-1.5 py-1 text-xs tabular-nums text-text-primary"
                />
              </label>
            ))}
            {overridden && (
              <button type="button" onClick={onClear} className="ml-auto text-xs text-text-muted underline hover:text-text-primary">
                {t("clearOverride")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Small mocked-up mini dashboard driven entirely by the `colors` prop
// (never the live document root / CSS vars) so the user sees exactly what
// a pending, uncommitted edit will look like before it goes live.
function ColorPreview({ colors }: { colors: ThemeColorTokens }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <div className="flex items-center justify-between rounded px-2 py-1.5" style={{ backgroundColor: colors.card }}>
        <span className="text-xs font-medium" style={{ color: colors.textPrimary }}>
          {t("colorPreviewLabel")}
        </span>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          XAUUSD
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded py-1.5 text-center text-xs font-semibold text-white" style={{ backgroundColor: colors.buy }}>
          BUY
        </div>
        <div className="flex-1 rounded py-1.5 text-center text-xs font-semibold text-white" style={{ backgroundColor: colors.sell }}>
          SELL
        </div>
      </div>
      <div
        className="flex flex-col gap-1.5 overflow-x-auto rounded px-2 py-2"
        style={{ backgroundColor: colors.cardAlt, borderTop: `1px solid ${colors.chartGrid}` }}
      >
        <CandlePreviewStrip colors={colors} />
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: colors.accent }}>
            {t("colorAccent")}
          </span>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.warning }} />
        </div>
      </div>
    </div>
  );
}

// 10 fixed (not live-data) candles in a row, deliberately varied to cover
// both up/down bodies and a range of wick lengths — a hammer, a doji-ish
// tiny body with long wicks both sides, a near-marubozu with almost no
// wick, etc. — so the preview is representative of "every shape a real
// candle can take" per Amir's ask, not just one uniform pattern. Values are
// plain y-coordinates in the 0-70 SVG viewBox, not real prices — accuracy
// there doesn't matter, only that body+wick, both directions, and a spread
// of proportions are all visibly present at once.
const CANDLE_WIDTH = 12;
const CANDLE_GAP = 8;
const CANDLE_SLOT = CANDLE_WIDTH + CANDLE_GAP;
const PREVIEW_CANDLES: { up: boolean; bodyTop: number; bodyBottom: number; wickTop: number; wickBottom: number }[] = [
  { up: true, bodyTop: 22, bodyBottom: 46, wickTop: 14, wickBottom: 52 },
  { up: false, bodyTop: 26, bodyBottom: 36, wickTop: 8, wickBottom: 56 },
  { up: true, bodyTop: 16, bodyBottom: 26, wickTop: 12, wickBottom: 60 }, // hammer — long lower wick
  { up: false, bodyTop: 30, bodyBottom: 42, wickTop: 18, wickBottom: 50 },
  { up: true, bodyTop: 10, bodyBottom: 58, wickTop: 8, wickBottom: 60 }, // near-marubozu — tiny wicks
  { up: false, bodyTop: 33, bodyBottom: 39, wickTop: 10, wickBottom: 60 }, // doji-ish — tiny body, long wicks
  { up: true, bodyTop: 44, bodyBottom: 54, wickTop: 12, wickBottom: 58 }, // shooting-star-like — long upper wick
  { up: false, bodyTop: 18, bodyBottom: 50, wickTop: 14, wickBottom: 54 },
  { up: true, bodyTop: 24, bodyBottom: 34, wickTop: 6, wickBottom: 44 },
  { up: false, bodyTop: 28, bodyBottom: 44, wickTop: 22, wickBottom: 50 },
];

function CandlePreviewStrip({ colors }: { colors: ThemeColorTokens }) {
  const width = PREVIEW_CANDLES.length * CANDLE_SLOT;
  return (
    // min-w guarantees the 10 candles always render at a legible, roughly
    // real-chart-like size instead of squishing to whatever narrow column
    // the settings layout happens to give it — the wrapper above scrolls
    // horizontally on a viewport too narrow to fit this outright.
    <svg viewBox={`0 0 ${width} 70`} preserveAspectRatio="none" className="h-16 w-full min-w-[40rem]">
      {PREVIEW_CANDLES.map((c, i) => {
        const cx = i * CANDLE_SLOT + CANDLE_GAP / 2 + CANDLE_WIDTH / 2;
        const bodyColor = c.up ? colors.buy : colors.sell;
        const wickColor = c.up ? colors.candleWickUp : colors.candleWickDown;
        return (
          <g key={i}>
            <line x1={cx} y1={c.wickTop} x2={cx} y2={c.wickBottom} stroke={wickColor} strokeWidth={2} />
            <rect
              x={cx - CANDLE_WIDTH / 2}
              y={c.bodyTop}
              width={CANDLE_WIDTH}
              height={Math.max(2, c.bodyBottom - c.bodyTop)}
              fill={bodyColor}
              rx={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}
