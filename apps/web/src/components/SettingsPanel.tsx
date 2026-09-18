"use client";

import { useState } from "react";
import type { AppLang, AppTheme, PlacementType, RiskMode, Settings, UpdateCheckResult, UpdateProgressStage } from "@xau-trader/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartArea,
  faDownload,
  faGear,
  faLanguage,
  faPalette,
  faRotate,
  faSliders,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { TIMEFRAMES } from "@/lib/timeframes";
import { Spinner } from "./Spinner";

interface SettingsPanelProps {
  settings: Settings | undefined;
  onUpdate: (partial: Partial<Settings>) => void;
  onCheckForUpdate: () => Promise<UpdateCheckResult>;
  onApplyUpdate: () => void;
  updateProgress: { stage: UpdateProgressStage; message?: string } | undefined;
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

const SELECT_CLASS =
  "rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

// Settings apply instantly on change (no separate Save step) — each field
// fires settings.update immediately, matching how the theme/language toggle
// itself needs to feel (see the plan: "دیگر پارامتر ها در متاتریدر عملیاتی
// نباشد" — this tab is the one real operational settings surface now).
export function SettingsPanel({ settings, onUpdate, onCheckForUpdate, onApplyUpdate, updateProgress }: SettingsPanelProps) {
  const { t } = useI18n();
  if (!settings) return <p className="text-sm text-text-muted">{t("calculating")}</p>;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <FontAwesomeIcon icon={faGear} className="h-3.5 w-3.5 text-text-muted" />
          {t("settingsTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faPalette} className="h-3 w-3" />
              {t("theme")}
            </span>
            <select
              className={SELECT_CLASS}
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value as AppTheme })}
            >
              <option value="dark">{t("themeDark")}</option>
              <option value="light">{t("themeLight")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faLanguage} className="h-3 w-3" />
              {t("language")}
            </span>
            <select
              className={SELECT_CLASS}
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
        <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <FontAwesomeIcon icon={faSliders} className="h-3.5 w-3.5 text-text-muted" />
          {t("defaultTradeSettings")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("sizingMode")}
            <select
              className={SELECT_CLASS}
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
              className={`${SELECT_CLASS} tabular-nums`}
              value={settings.riskValue}
              onChange={(e) => onUpdate({ riskValue: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("orderType")}
            <select
              className={SELECT_CLASS}
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
              className={`${SELECT_CLASS} tabular-nums`}
              value={settings.rrRatio}
              onChange={(e) => onUpdate({ rrRatio: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t("chartTimeframe")}
            <select
              className={SELECT_CLASS}
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

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <FontAwesomeIcon icon={faChartArea} className="h-3.5 w-3.5 text-text-muted" />
          {t("chartSection")}
        </h2>
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={settings.chartGridVisible}
            onChange={(e) => onUpdate({ chartGridVisible: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          <FontAwesomeIcon icon={faTableCells} className="h-3 w-3 text-text-muted" />
          {t("grid")}
        </label>
      </div>

      <UpdateCheckSection onCheckForUpdate={onCheckForUpdate} onApplyUpdate={onApplyUpdate} updateProgress={updateProgress} />
    </div>
  );
}

const PROGRESS_KEY: Record<UpdateProgressStage, TranslationKey> = {
  downloading: "updateDownloading",
  installing: "updateInstalling",
  restarting: "updateRestarting",
  error: "updateFailed",
};

interface UpdateCheckSectionProps {
  onCheckForUpdate: () => Promise<UpdateCheckResult>;
  onApplyUpdate: () => void;
  updateProgress: { stage: UpdateProgressStage; message?: string } | undefined;
}

// Manual-only, triggered by this button — see project memory
// project_xau_trader_web_platform's self-update section: no automatic
// startup/interval check for an app connected to a live broker/order flow.
// The check itself (onCheckForUpdate) only compares version numbers; the
// actual download/install/restart (onApplyUpdate, entirely backend-side —
// see apps/bridge/src/selfUpdate.ts) is a second, explicit click once a
// newer version is known to exist. Deliberately never shows a release URL
// or any other detail of where the update comes from.
function UpdateCheckSection({ onCheckForUpdate, onApplyUpdate, updateProgress }: UpdateCheckSectionProps) {
  const { t } = useI18n();
  const [lastResult, setLastResult] = useState<UpdateCheckResult | null>(null);
  const { run: runCheck, pending: checking } = useAsyncAction({
    action: onCheckForUpdate,
    successMessage: (res) => (res.hasUpdate ? t("newVersionAvailable") : t("upToDate")),
  });

  const applying = updateProgress !== undefined && updateProgress.stage !== "error";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5 text-text-muted" />
        {t("updatesSection")}
      </h2>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          {applying
            ? t(PROGRESS_KEY[updateProgress.stage])
            : updateProgress?.stage === "error"
              ? `${t("updateFailed")}${updateProgress.message ? `: ${updateProgress.message}` : ""}`
              : lastResult
                ? `v${lastResult.currentVersion}${lastResult.hasUpdate ? ` — v${lastResult.latestVersion} ${t("newVersionAvailable")}` : ""}`
                : t("updatesSectionHint")}
        </p>
        {lastResult?.hasUpdate ? (
          <button
            type="button"
            disabled={applying}
            onClick={onApplyUpdate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors duration-150 hover:enabled:bg-accent/20 disabled:opacity-50"
          >
            {applying ? <Spinner size={11} /> : <FontAwesomeIcon icon={faRotate} className="h-3 w-3" />}
            {t("installAndRestart")}
          </button>
        ) : (
          <button
            type="button"
            disabled={checking}
            onClick={() => void runCheck().then((res) => res && setLastResult(res))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-text-primary transition-colors duration-150 hover:enabled:bg-card-alt disabled:opacity-50"
          >
            {checking ? <Spinner size={11} /> : <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />}
            {t("checkForUpdates")}
          </button>
        )}
      </div>
    </div>
  );
}
