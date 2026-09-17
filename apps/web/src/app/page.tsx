"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBridgeSocket } from "@/lib/useBridgeSocket";
import { useTradePlan } from "@/lib/useTradePlan";
import type { DraggableLine } from "@/lib/priceLineDrag";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { AccountBar } from "@/components/AccountBar";
import { PositionsBar } from "@/components/PositionsBar";
import { LiveChart } from "@/components/LiveChart";
import { MoneyPanel } from "@/components/MoneyPanel";
import { Journal } from "@/components/Journal";
import { SettingsPanel } from "@/components/SettingsPanel";

const DEFAULT_BAR_COUNT = 500;
type Tab = "dashboard" | "journal" | "settings";

export default function DashboardPage() {
  const bridge = useBridgeSocket();
  const { settings } = bridge;

  return (
    <I18nProvider lang={settings?.lang ?? "en"}>
      <ThemeSync theme={settings?.theme ?? "dark"} lang={settings?.lang ?? "en"} />
      <Shell bridge={bridge} />
    </I18nProvider>
  );
}

function ThemeSync({ theme, lang }: { theme: string; lang: string }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  }, [theme, lang]);
  return null;
}

function Shell({ bridge }: { bridge: ReturnType<typeof useBridgeSocket> }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("dashboard");
  const {
    wsConnected,
    eaConnected,
    tick,
    account,
    symbol,
    positions,
    bars,
    lastError,
    settings,
    journalDeals,
    journalComments,
    requestBars,
    previewRisk,
    sendOrder,
    modifyPosition,
    closePosition,
    updateSettings,
    requestJournal,
    requestComments,
    addJournalComment,
    editJournalComment,
    deleteJournalComment,
  } = bridge;

  const {
    plan,
    reviewing,
    riskResult,
    riskError,
    busy,
    startReview,
    cancelReview,
    setEntryPrice,
    setSlPrice,
    setTpPrice,
    setRiskMode,
    setRiskValue,
    setPlacement,
    setRrRatio,
    confirmOrder,
  } = useTradePlan({
    tick,
    symbol,
    previewRisk,
    sendOrder,
    settingsDefaults: settings
      ? { riskMode: settings.riskMode, riskValue: settings.riskValue, placement: settings.placement, rrRatio: settings.rrRatio }
      : undefined,
  });

  const requestedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (symbol?.valid && requestedFor.current !== symbol.symbol) {
      requestedFor.current = symbol.symbol;
      requestBars(symbol.symbol, settings?.chartTimeframe ?? "M1", DEFAULT_BAR_COUNT);
    }
  }, [symbol, settings?.chartTimeframe, requestBars]);

  useEffect(() => {
    if (tab === "journal") requestJournal();
  }, [tab, requestJournal]);

  // Tracks each open position's latest known sl/tp locally so dragging SL
  // then TP in quick succession (before the server round-trip confirms the
  // first) doesn't send a stale value for whichever field wasn't just
  // touched — mirrors XAU_Trader.mq5's own g_posModifyDirty/g_posModifyTicket
  // pattern for the same reason.
  const pendingPosRef = useRef(new Map<number, { sl: number; tp: number }>());
  useEffect(() => {
    for (const p of positions) pendingPosRef.current.set(p.ticket, { sl: p.sl, tp: p.tp });
  }, [positions]);

  const digits = symbol?.digits ?? 2;

  const lines = useMemo<DraggableLine[]>(() => {
    const result: DraggableLine[] = [];
    if (reviewing) {
      if (plan.placement !== "market" && plan.entryPrice > 0) {
        result.push({ id: "plan:entry", price: plan.entryPrice, color: "#d4af37", title: t("entry"), draggable: true, dashed: true });
      }
      if (plan.slPrice > 0) result.push({ id: "plan:sl", price: plan.slPrice, color: "#ef4444", title: t("sl"), draggable: true, dashed: true });
      if (plan.tpPrice > 0) result.push({ id: "plan:tp", price: plan.tpPrice, color: "#22c55e", title: t("tp"), draggable: true, dashed: true });
    }
    for (const p of positions) {
      if (p.sl > 0) result.push({ id: `pos:${p.ticket}:sl`, price: p.sl, color: "#ef4444", title: `#${p.ticket} ${t("sl")}`, draggable: true });
      if (p.tp > 0) result.push({ id: `pos:${p.ticket}:tp`, price: p.tp, color: "#22c55e", title: `#${p.ticket} ${t("tp")}`, draggable: true });
    }
    return result;
  }, [reviewing, plan, positions, t]);

  function handlePositionDrag(ticket: number, which: "sl" | "tp", price: number) {
    const current = pendingPosRef.current.get(ticket) ?? { sl: 0, tp: 0 };
    const next = which === "sl" ? { sl: price, tp: current.tp } : { sl: current.sl, tp: price };
    pendingPosRef.current.set(ticket, next);
    modifyPosition(ticket, next.sl, next.tp);
  }

  function handleLineDrag(id: string, price: number) {
    if (id === "plan:entry") setEntryPrice(price);
    else if (id === "plan:sl") setSlPrice(price);
    else if (id === "plan:tp") setTpPrice(price);
    else if (id.startsWith("pos:")) {
      const [, ticketStr, which] = id.split(":");
      handlePositionDrag(Number(ticketStr), which as "sl" | "tp", price);
    }
  }

  return (
    <main className="flex h-dvh flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-accent-gold">{t("appTitle")}</h1>
            <span className="text-sm text-text-muted">{symbol?.symbol ?? "—"}</span>
          </div>
          <nav className="flex gap-1">
            {(["dashboard", "journal", "settings"] as Tab[]).map((tb) => (
              <button
                key={tb}
                type="button"
                onClick={() => setTab(tb)}
                className="rounded px-3 py-1.5 text-sm"
                style={{
                  color: tab === tb ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  backgroundColor: tab === tb ? "var(--color-card-alt)" : "transparent",
                }}
              >
                {t(tb === "dashboard" ? "navDashboard" : tb === "journal" ? "navJournal" : "navSettings")}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {lastError && (
            <span className="text-xs" style={{ color: "var(--color-sell)" }}>
              {lastError}
            </span>
          )}
          <ConnectionBadge label={t("connBridge")} connected={wsConnected} />
          <ConnectionBadge label={t("connEA")} connected={eaConnected} />
        </div>
      </header>

      {tab === "dashboard" && (
        <>
          <AccountBar account={account} symbol={symbol} tick={tick} />
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-4">
            <div className="min-h-0 rounded-lg border border-border bg-card p-2">
              <LiveChart bars={bars} lines={lines} onLineDrag={handleLineDrag} onLineDragEnd={handleLineDrag} />
            </div>
            <MoneyPanel
              plan={plan}
              reviewing={reviewing}
              riskResult={riskResult}
              riskError={riskError}
              busy={busy}
              currency={account?.currency}
              digits={digits}
              onRiskModeChange={setRiskMode}
              onRiskValueChange={setRiskValue}
              onPlacementChange={setPlacement}
              onRrRatioChange={setRrRatio}
              onBuy={() => startReview("buy")}
              onSell={() => startReview("sell")}
              onConfirm={() => void confirmOrder()}
              onCancel={cancelReview}
            />
          </div>
          <PositionsBar positions={positions} symbol={symbol} onClose={(ticket) => void closePosition(ticket)} />
        </>
      )}

      {tab === "journal" && (
        <Journal
          deals={journalDeals}
          comments={journalComments}
          currency={account?.currency}
          onSearch={(search) => requestJournal({ search: search || undefined })}
          onSelectDeal={requestComments}
          onAddComment={addJournalComment}
          onEditComment={editJournalComment}
          onDeleteComment={deleteJournalComment}
        />
      )}

      {tab === "settings" && <SettingsPanel settings={settings} onUpdate={updateSettings} />}
    </main>
  );
}
