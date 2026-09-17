"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, DrawingTool } from "@xau-trader/protocol";
import { useBridgeSocket } from "@/lib/useBridgeSocket";
import { useTradePlan } from "@/lib/useTradePlan";
import type { DraggableLine } from "@/lib/priceLineDrag";
import { I18nProvider } from "@/lib/i18n";
import { readChartPalette } from "@/lib/theme";
import type { Timeframe } from "@/lib/timeframes";
import { TopBar } from "@/components/TopBar";
import { PositionsBar } from "@/components/PositionsBar";
import { LiveChart } from "@/components/LiveChart";
import { ChartToolbar } from "@/components/ChartToolbar";
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
  const [tab, setTab] = useState<Tab>("dashboard");
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const {
    wsConnected,
    eaConnected,
    tick,
    account,
    symbol,
    positions,
    bars,
    liveBar,
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

  const timeframe = settings?.chartTimeframe ?? "M1";
  const gridVisible = settings?.chartGridVisible ?? true;
  const drawings = settings?.chartDrawings ?? [];

  const requestedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (symbol?.valid && requestedFor.current !== `${symbol.symbol}:${timeframe}`) {
      requestedFor.current = `${symbol.symbol}:${timeframe}`;
      requestBars(symbol.symbol, timeframe, DEFAULT_BAR_COUNT);
    }
  }, [symbol, timeframe, requestBars]);

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
    const palette = readChartPalette();
    const result: DraggableLine[] = [];
    if (reviewing) {
      if (plan.placement !== "market" && plan.entryPrice > 0) {
        result.push({ id: "plan:entry", price: plan.entryPrice, color: palette.accent, title: "Entry", draggable: true, dashed: true });
      }
      if (plan.slPrice > 0) result.push({ id: "plan:sl", price: plan.slPrice, color: palette.sell, title: "SL", draggable: true, dashed: true });
      if (plan.tpPrice > 0) result.push({ id: "plan:tp", price: plan.tpPrice, color: palette.buy, title: "TP", draggable: true, dashed: true });
    }
    for (const p of positions) {
      if (p.sl > 0) result.push({ id: `pos:${p.ticket}:sl`, price: p.sl, color: palette.sell, title: `#${p.ticket} SL`, draggable: true });
      if (p.tp > 0) result.push({ id: `pos:${p.ticket}:tp`, price: p.tp, color: palette.buy, title: `#${p.ticket} TP`, draggable: true });
    }
    return result;
    // settings?.theme triggers a recompute so line colors follow a theme
    // switch (readChartPalette() reads the DOM, not this prop directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, plan, positions, settings?.theme]);

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

  function handleTimeframeChange(tf: Timeframe) {
    if (tf === timeframe) return;
    requestedFor.current = undefined; // force the effect above to re-request for the new timeframe
    updateSettings({ chartTimeframe: tf });
  }

  function handleDrawingCreated(drawing: Drawing) {
    updateSettings({ chartDrawings: [...drawings, drawing] });
    setActiveDrawingTool(null);
  }

  function handleDeleteSelectedDrawing() {
    if (!selectedDrawingId) return;
    updateSettings({ chartDrawings: drawings.filter((d) => d.id !== selectedDrawingId) });
    setSelectedDrawingId(null);
  }

  return (
    <main className="flex h-dvh flex-col gap-3 p-3">
      <TopBar
        tab={tab}
        onTabChange={setTab}
        symbol={symbol}
        wsConnected={wsConnected}
        eaConnected={eaConnected}
        lastError={lastError}
        account={account}
        tick={tick}
      />

      {/* Always mounted, hidden via CSS rather than conditionally rendered —
          unmounting used to destroy and recreate the whole lightweight-charts
          instance on every tab switch. Since bar.update keeps streaming
          regardless of which tab is visible, a remount replayed only the
          *current* liveBar against a stale initial `bars` snapshot,
          silently dropping every candle that closed while away (reported
          live). Keeping it mounted means series.update() keeps applying
          every tick in the background, so nothing is ever missed. */}
      <div className={`grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-3 ${tab === "dashboard" ? "" : "hidden"}`}>
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <ChartToolbar
            timeframe={timeframe}
            onTimeframeChange={handleTimeframeChange}
            gridVisible={gridVisible}
            onGridToggle={() => updateSettings({ chartGridVisible: !gridVisible })}
            activeTool={activeDrawingTool}
            onToolChange={setActiveDrawingTool}
            hasSelection={selectedDrawingId !== null}
            onDeleteSelected={handleDeleteSelectedDrawing}
          />
          <div className="min-h-0 flex-1 p-2">
            <LiveChart
              bars={bars}
              liveBar={liveBar}
              timeframe={timeframe}
              gridVisible={gridVisible}
              theme={settings?.theme ?? "dark"}
              lines={lines}
              onLineDrag={handleLineDrag}
              onLineDragEnd={handleLineDrag}
              drawings={drawings}
              activeDrawingTool={activeDrawingTool}
              onDrawingCreated={handleDrawingCreated}
              onDrawingSelectedChange={setSelectedDrawingId}
            />
          </div>
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

      <div className={tab === "dashboard" ? "" : "hidden"}>
        <PositionsBar positions={positions} symbol={symbol} onClose={(ticket) => void closePosition(ticket)} />
      </div>

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
