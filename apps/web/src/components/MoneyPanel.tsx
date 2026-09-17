import type { PlacementType, RiskMode, RiskResult, TradePlan } from "@xau-trader/protocol";
import { validationMessage } from "@/lib/validationMessages";
import { XAUT_RR_MAX, XAUT_RR_MIN, XAUT_RR_STEP } from "@/lib/tradeDefaults";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface MoneyPanelProps {
  plan: TradePlan;
  reviewing: boolean;
  riskResult: RiskResult | undefined;
  riskError: string | undefined;
  busy: boolean;
  currency: string | undefined;
  digits: number;
  onRiskModeChange: (mode: RiskMode) => void;
  onRiskValueChange: (value: number) => void;
  onPlacementChange: (placement: PlacementType) => void;
  onRrRatioChange: (rr: number) => void;
  onBuy: () => void;
  onSell: () => void;
  onConfirm: () => void;
  onCancel: () => void;
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

function fmtMoney(v: number, currency: string | undefined) {
  return `${v.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

export function MoneyPanel({
  plan,
  reviewing,
  riskResult,
  riskError,
  busy,
  currency,
  digits,
  onRiskModeChange,
  onRiskValueChange,
  onPlacementChange,
  onRrRatioChange,
  onBuy,
  onSell,
  onConfirm,
  onCancel,
}: MoneyPanelProps) {
  const { t, lang } = useI18n();
  const errorText = riskError ?? (riskResult && riskResult.code !== "ok" ? validationMessage(riskResult.code, lang) : undefined);
  const canConfirm = reviewing && !busy && riskResult?.code === "ok" && riskResult.lots > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-text-primary">{t("moneyManagement")}</h2>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("sizingMode")}
          <select
            className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
            value={plan.riskMode}
            onChange={(e) => onRiskModeChange(e.target.value as RiskMode)}
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
            value={plan.riskValue}
            onChange={(e) => onRiskValueChange(Number(e.target.value))}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("orderType")}
          <select
            className="rounded border border-border bg-card-alt px-2 py-1.5 text-sm text-text-primary"
            value={plan.placement}
            onChange={(e) => onPlacementChange(e.target.value as PlacementType)}
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-7 w-7 rounded border border-border bg-card-alt text-text-primary disabled:opacity-40"
              disabled={plan.rrRatio <= XAUT_RR_MIN}
              onClick={() => onRrRatioChange(Math.max(XAUT_RR_MIN, plan.rrRatio - XAUT_RR_STEP))}
            >
              −
            </button>
            <span className="flex-1 text-center text-sm tabular-nums text-text-primary">{plan.rrRatio.toFixed(1)}</span>
            <button
              type="button"
              className="h-7 w-7 rounded border border-border bg-card-alt text-text-primary disabled:opacity-40"
              disabled={plan.rrRatio >= XAUT_RR_MAX}
              onClick={() => onRrRatioChange(Math.min(XAUT_RR_MAX, plan.rrRatio + XAUT_RR_STEP))}
            >
              +
            </button>
          </div>
        </label>
      </div>

      {!reviewing ? (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onBuy}
            className="rounded py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-buy)" }}
          >
            {t("buy")}
          </button>
          <button
            type="button"
            onClick={onSell}
            className="rounded py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-sell)" }}
          >
            {t("sell")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card-alt p-3">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {t("confirmTrade")} — {t(plan.direction === "buy" ? "buy" : "sell").toUpperCase()}
            </span>
          </div>
          {errorText ? (
            <p className="text-sm" style={{ color: "var(--color-sell)" }}>
              {errorText}
            </p>
          ) : riskResult ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
              <span className="text-text-muted">{t("lots")}</span>
              <span className="text-right text-text-primary">{riskResult.lots.toFixed(2)}</span>
              <span className="text-text-muted">{t("risk")}</span>
              <span className="text-right" style={{ color: "var(--color-sell)" }}>
                {fmtMoney(riskResult.riskMoney, currency)}
              </span>
              <span className="text-text-muted">{t("reward")}</span>
              <span className="text-right" style={{ color: "var(--color-buy)" }}>
                {fmtMoney(riskResult.rewardMoney, currency)}
              </span>
              <span className="text-text-muted">{t("entry")}</span>
              <span className="text-right text-text-primary">{plan.entryPrice.toFixed(digits)}</span>
            </div>
          ) : (
            <p className="text-sm text-text-muted">{t("calculating")}</p>
          )}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={onCancel} className="rounded border border-border py-2 text-sm text-text-primary">
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="rounded py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: plan.direction === "buy" ? "var(--color-buy)" : "var(--color-sell)" }}
            >
              {busy ? t("sending") : t("confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
