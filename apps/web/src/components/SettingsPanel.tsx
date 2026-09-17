"use client";

import type { AppLang, AppTheme, PlacementType, RiskMode, Settings } from "@xau-trader/protocol";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface SettingsPanelProps {
  settings: Settings | undefined;
  onUpdate: (partial: Partial<Settings>) => void;
}

const RISK_MODE_KEY: Record<RiskMode, TranslationKey> = {
  percent_balance: "riskPctBalance",
  percent_equity: "riskPctEquity",
  fixed_money: "riskFixedMoney",
};

const PLACEMENT_KEY: Record<PlacementType, TranslationKey> = {
  market: "placementMarket",
  limit: "placementLimit",
  stop: "placementStop",
};

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];

// Settings apply instantly on change (no separate Save step) — each field
// fires settings.update immediately, matching how the theme/language toggle
// itself needs to feel (see the plan: "دیگر پارامتر ها در متاتریدر عملیاتی
// نباشد" — this tab is the one real operational settings surface now).
export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  const { t } = useI18n();
  if (!settings) return <p className="text-sm text-text-muted">{t("calculating")}</p>;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-text-primary">{t("settingsTitle")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("theme")}
            <select
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value as AppTheme })}
            >
              <option value="dark">{t("themeDark")}</option>
              <option value="light">{t("themeLight")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("language")}
            <select
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
              value={settings.lang}
              onChange={(e) => onUpdate({ lang: e.target.value as AppLang })}
            >
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-text-primary">{t("defaultTradeSettings")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("sizingMode")}
            <select
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
              value={settings.riskMode}
              onChange={(e) => onUpdate({ riskMode: e.target.value as RiskMode })}
            >
              {(Object.keys(RISK_MODE_KEY) as RiskMode[]).map((m) => (
                <option key={m} value={m}>
                  {t(RISK_MODE_KEY[m])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("riskValue")}
            <input
              type="number"
              step="0.1"
              min="0"
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary tabular-nums"
              value={settings.riskValue}
              onChange={(e) => onUpdate({ riskValue: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("orderType")}
            <select
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
              value={settings.placement}
              onChange={(e) => onUpdate({ placement: e.target.value as PlacementType })}
            >
              {(Object.keys(PLACEMENT_KEY) as PlacementType[]).map((p) => (
                <option key={p} value={p}>
                  {t(PLACEMENT_KEY[p])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("rr")}
            <input
              type="number"
              step="0.5"
              min="1"
              max="5"
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary tabular-nums"
              value={settings.rrRatio}
              onChange={(e) => onUpdate({ rrRatio: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("chartTimeframe")}
            <select
              className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
              value={settings.chartTimeframe}
              onChange={(e) => onUpdate({ chartTimeframe: e.target.value })}
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
