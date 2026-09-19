"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, DrawingTool, PositionInfo, ThemeColorTokens } from "@xau-trader/protocol";
import { useBridgeSocket } from "@/lib/useBridgeSocket";
import { useTradePlan } from "@/lib/useTradePlan";
import type { DraggableLine } from "@/lib/priceLineDrag";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { readChartPalette } from "@/lib/theme";
import { applyCustomColors } from "@/lib/applyCustomColors";
import { ToastProvider, useToast } from "@/lib/toast";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useResizable } from "@/lib/useResizable";
import { useFullscreen } from "@/lib/useFullscreen";
import type { Timeframe } from "@/lib/timeframes";
import { TopBar } from "@/components/TopBar";
import { PositionsBar } from "@/components/PositionsBar";
import { LiveChart } from "@/components/LiveChart";
import { ChartToolbar } from "@/components/ChartToolbar";
import { MoneyPanel } from "@/components/MoneyPanel";
import { ResizeHandle } from "@/components/ResizeHandle";
import { EdgeReveal } from "@/components/EdgeReveal";
import { Journal } from "@/components/Journal";
import { SettingsPanel } from "@/components/SettingsPanel";

// Clamp range for the drag-resizable chart<->MoneyPanel and chart-area<->
// PositionsBar splits (lib/useResizable.ts) — generous enough to give a
// section real dedicated room, never so wide/tall the other side stops
// being usable.
const MONEY_PANEL_WIDTH_MIN = 260;
const MONEY_PANEL_WIDTH_MAX = 480;
const POSITIONS_BAR_HEIGHT_MIN = 90;
const POSITIONS_BAR_HEIGHT_MAX = 420;
// Fixed header height while in fullscreen (it's a single compact row by
// design — see TopBar.tsx — so it isn't user-resizable there).
const FULLSCREEN_HEADER_SIZE = 52;

// Initial load: aggressive on purpose — this is a local, single-user,
// resource-unconstrained setup (no network latency to a remote history
// server, CopyRates reads straight out of MT5's local history cache), so
// there's no reason to start users off with a shallow 500-bar window like a
// hosted charting product would. Further history beyond this loads
// progressively (see HISTORY_PAGE_SIZE / LiveChart's pan-to-edge detection)
// rather than requesting everything in one shot, so the reveal stays a
// deliberate animated build-out instead of a multi-second blocking fetch.
const DEFAULT_BAR_COUNT = 5000;
const HISTORY_PAGE_SIZE = 2000;
type Tab = "dashboard" | "journal" | "settings";

export default function DashboardPage() {
  const bridge = useBridgeSocket();
  const { settings } = bridge;

  return (
    <I18nProvider lang={settings?.lang ?? "en"}>
      <ThemeSync
        theme={settings?.theme ?? "dark"}
        lang={settings?.lang ?? "en"}
        customColorsDark={settings?.customColorsDark}
        customColorsLight={settings?.customColorsLight}
      />
      <ToastProvider>
        <Shell bridge={bridge} />
      </ToastProvider>
    </I18nProvider>
  );
}

function ThemeSync({
  theme,
  lang,
  customColorsDark,
  customColorsLight,
}: {
  theme: string;
  lang: string;
  customColorsDark: Partial<ThemeColorTokens> | undefined;
  customColorsLight: Partial<ThemeColorTokens> | undefined;
}) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    applyCustomColors(theme === "light" ? customColorsLight : customColorsDark);
  }, [theme, lang, customColorsDark, customColorsLight]);
  return null;
}

function Shell({ bridge }: { bridge: ReturnType<typeof useBridgeSocket> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const {
    wsConnected,
    eaConnected,
    tick,
    account,
    symbol,
    positions,
    pendingOrders,
    bars,
    liveBar,
    hasMoreHistory,
    loadingOlderBars,
    barsAppendedOlderCount,
    barsResyncEpoch,
    lastError,
    settings,
    journalDeals,
    journalComments,
    requestBars,
    selectSymbol,
    previewRisk,
    sendOrder,
    modifyPosition,
    closePosition,
    closePositionPartial,
    cancelPending,
    updateSettings,
    requestJournal,
    requestComments,
    addJournalComment,
    editJournalComment,
    deleteJournalComment,
    checkForUpdate,
    applyUpdate,
    updateProgress,
  } = bridge;

  const {
    plan,
    reviewing,
    riskResult,
    riskError,
    previewPending,
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

  const { run: runConfirmOrder, pending: confirmBusy } = useAsyncAction({
    action: confirmOrder,
    successMessage: t("orderPlaced"),
    resultError: (ack) => (ack.ok ? undefined : ack.message || t("orderFailed")),
    errorFallbackMessage: t("orderFailed"),
  });

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const { size: moneyPanelWidth, dragHandlers: moneyPanelDrag } = useResizable({
    axis: "x",
    value: settings?.moneyPanelWidth ?? 320,
    min: MONEY_PANEL_WIDTH_MIN,
    max: MONEY_PANEL_WIDTH_MAX,
    // The handle sits to the panel's left — dragging it right shrinks the
    // panel (gives the chart more room), dragging left grows it.
    invert: true,
    onCommit: (w) => updateSettings({ moneyPanelWidth: w }),
  });

  const { size: positionsBarHeight, dragHandlers: positionsBarDrag } = useResizable({
    axis: "y",
    value: settings?.positionsBarHeight ?? 220,
    min: POSITIONS_BAR_HEIGHT_MIN,
    max: POSITIONS_BAR_HEIGHT_MAX,
    // The handle sits above the panel — dragging it down shrinks the panel
    // (gives the chart row above more room), dragging up grows it.
    invert: true,
    onCommit: (h) => updateSettings({ positionsBarHeight: h }),
  });

  const timeframe = settings?.chartTimeframe ?? "M1";
  const gridVisible = settings?.chartGridVisible ?? true;
  const drawings = settings?.chartDrawings ?? [];
  const magnetEnabled = settings?.magnetEnabled ?? false;
  const crosshairEnabled = settings?.crosshairEnabled ?? true;

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
  const selectionColor =
    (selectedDrawingIds.length > 0 && drawings.find((d) => d.id === selectedDrawingIds[0])?.color) || readChartPalette().accent;
  const defaultDrawingColor = settings?.lastDrawingColor || readChartPalette().accent;

  const lines = useMemo<DraggableLine[]>(() => {
    const palette = readChartPalette();
    const result: DraggableLine[] = [];
    // Live Bid/Ask reference lines — always shown (not just while a
    // position is open), matching a standard trading platform's current-
    // price indicator. Buy positions close at bid, sell positions close at
    // ask, so both are worth seeing live, not just one blended "last price"
    // (which is why the series' own default price line is disabled — see
    // LiveChart.tsx — in favor of these two explicit ones).
    if (tick) {
      result.push({ id: "live:bid", price: tick.bid, color: palette.sell, title: t("bid"), draggable: false, dashed: true });
      result.push({ id: "live:ask", price: tick.ask, color: palette.buy, title: t("ask"), draggable: false, dashed: true });
    }
    if (reviewing) {
      if (plan.placement !== "market" && plan.entryPrice > 0) {
        result.push({ id: "plan:entry", price: plan.entryPrice, color: palette.accent, title: "Entry", draggable: true, dashed: true });
      }
      if (plan.slPrice > 0) result.push({ id: "plan:sl", price: plan.slPrice, color: palette.sell, title: "SL", draggable: true, dashed: true });
      if (plan.tpPrice > 0) result.push({ id: "plan:tp", price: plan.tpPrice, color: palette.buy, title: "TP", draggable: true, dashed: true });
    }
    for (const p of positions) {
      // Reference only — an executed entry price can't be moved, so this
      // isn't draggable (the drag controller already skips hit-testing for
      // non-draggable lines, see priceLineDrag.ts), but it's rendered the
      // same way as SL/TP so the position's entry is visible on the chart
      // at a glance, not just in the positions table.
      if (p.priceOpen > 0) {
        result.push({ id: `pos:${p.ticket}:entry`, price: p.priceOpen, color: palette.accent, title: `#${p.ticket}`, draggable: false, dashed: true });
      }
      if (p.sl > 0) result.push({ id: `pos:${p.ticket}:sl`, price: p.sl, color: palette.sell, title: `#${p.ticket} SL`, draggable: true });
      if (p.tp > 0) result.push({ id: `pos:${p.ticket}:tp`, price: p.tp, color: palette.buy, title: `#${p.ticket} TP`, draggable: true });
    }
    return result;
    // settings?.theme triggers a recompute so line colors follow a theme
    // switch (readChartPalette() reads the DOM, not this prop directly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, plan, positions, tick, settings?.theme]);

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

  function handleRequestOlderBars() {
    if (!symbol?.valid) return;
    requestBars(symbol.symbol, timeframe, HISTORY_PAGE_SIZE, bars.length);
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

  // Move/reshape (see lib/drawingTools.ts's drag handling) — the controller
  // already computed the new point(s) locally and only calls this once, on
  // pointerup, so this is a single settings write per drag, not per frame.
  function handleDrawingUpdated(updated: Drawing) {
    updateSettings({ chartDrawings: drawings.map((d) => (d.id === updated.id ? updated : d)) });
  }

  function handleToolChange(tool: DrawingTool | null) {
    setActiveDrawingTool(tool);
    if (tool) setSelectMode(false); // mutually exclusive with the Selector tool
  }

  function handleSelectModeToggle() {
    setSelectMode((prev) => {
      const next = !prev;
      if (next) setActiveDrawingTool(null);
      return next;
    });
  }

  function handleDeleteSelectedDrawings() {
    if (selectedDrawingIds.length === 0) return;
    const idSet = new Set(selectedDrawingIds);
    updateSettings({ chartDrawings: drawings.filter((d) => !idSet.has(d.id)) });
    setSelectedDrawingIds([]);
  }

  function handleSelectionColorChange(color: string) {
    if (selectedDrawingIds.length === 0) return;
    const idSet = new Set(selectedDrawingIds);
    // Also persisted as lastDrawingColor — every drawing placed *after* this
    // one defaults to whatever was just picked here (Amir: stop resetting
    // to the theme accent every time), see defaultDrawingColor below.
    updateSettings({ chartDrawings: drawings.map((d) => (idSet.has(d.id) ? { ...d, color } : d)), lastDrawingColor: color });
  }

  // "Risk-Free": moves a position's SL to entry +/- riskFreePips (raw
  // symbol.point units, per Amir's own wording), optionally widened by the
  // live spread so a bid/ask fill gap can't still stop it out right at the
  // boundary. Reuses the same fire-and-forget modifyPosition path the chart
  // drag already uses (EA-coalesced, confirmation arrives via the next
  // positions push) — no ack to await, so this deliberately doesn't go
  // through useAsyncAction (which needs a Promise); a toast fires
  // immediately instead, matching how the drag itself gives no per-call
  // confirmation either.
  function handleRiskFree(position: PositionInfo) {
    if (!symbol?.valid) return;
    const pips = settings?.riskFreePips ?? 0;
    const considerSpread = settings?.riskFreeConsiderSpread ?? false;
    const spread = considerSpread && tick ? tick.ask - tick.bid : 0;
    const distance = pips * symbol.point + spread;
    const isBuy = position.type === "buy";
    const sl = isBuy ? position.priceOpen + distance : position.priceOpen - distance;
    modifyPosition(position.ticket, sl, position.tp);
    toast.show("success", t("riskFreeApplied"));
  }

  return (
    <main className={`flex h-dvh flex-col ${isFullscreen ? "gap-0 p-0" : "gap-3 p-3"}`}>
      {/* Fullscreen (Amir: give the chart the whole browser window) takes
          the header out of flow entirely and brings it back as a hover
          overlay — EdgeReveal is an inert passthrough outside fullscreen,
          so this wrapper never changes TopBar's own position in the tree
          (nothing here risks the LiveChart-remount trap below). */}
      <EdgeReveal active={isFullscreen} edge="top" size={FULLSCREEN_HEADER_SIZE}>
        <TopBar
          tab={tab}
          onTabChange={setTab}
          symbol={symbol}
          wsConnected={wsConnected}
          eaConnected={eaConnected}
          lastError={lastError}
          account={account}
          tick={tick}
          theme={settings?.theme ?? "dark"}
          onThemeToggle={() => updateSettings({ theme: settings?.theme === "light" ? "dark" : "light" })}
          onSymbolSelect={selectSymbol}
          isFullscreen={isFullscreen}
          onFullscreenToggle={toggleFullscreen}
        />
      </EdgeReveal>

      {/* Always mounted, hidden via CSS rather than conditionally rendered —
          unmounting used to destroy and recreate the whole lightweight-charts
          instance on every tab switch. Since bar.update keeps streaming
          regardless of which tab is visible, a remount replayed only the
          *current* liveBar against a stale initial `bars` snapshot,
          silently dropping every candle that closed while away (reported
          live). Keeping it mounted means series.update() keeps applying
          every tick in the background, so nothing is ever missed. Chart's
          own wrapping div below never changes shape between fullscreen
          states — only sizing/gaps around it do — for the same reason. */}
      <div className={`flex min-h-0 flex-1 flex-col ${isFullscreen ? "gap-0" : "gap-3"} ${tab === "dashboard" ? "" : "hidden"}`}>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
            <ChartToolbar
              timeframe={timeframe}
              onTimeframeChange={handleTimeframeChange}
              gridVisible={gridVisible}
              onGridToggle={() => updateSettings({ chartGridVisible: !gridVisible })}
              magnetEnabled={magnetEnabled}
              onMagnetToggle={() => updateSettings({ magnetEnabled: !magnetEnabled })}
              crosshairEnabled={crosshairEnabled}
              onCrosshairToggle={() => updateSettings({ crosshairEnabled: !crosshairEnabled })}
              activeTool={activeDrawingTool}
              onToolChange={handleToolChange}
              selectMode={selectMode}
              onSelectModeToggle={handleSelectModeToggle}
              selectionCount={selectedDrawingIds.length}
              onDeleteSelected={handleDeleteSelectedDrawings}
              selectionColor={selectionColor}
              onSelectionColorChange={handleSelectionColorChange}
            />
            <div className="min-h-0 flex-1 p-2">
              <LiveChart
                bars={bars}
                barsAppendedOlderCount={barsAppendedOlderCount}
                barsResyncEpoch={barsResyncEpoch}
                liveBar={liveBar}
                timeframe={timeframe}
                gridVisible={gridVisible}
                theme={settings?.theme ?? "dark"}
                customColors={settings?.theme === "light" ? settings?.customColorsLight : settings?.customColorsDark}
                lines={lines}
                onLineDrag={handleLineDrag}
                onLineDragEnd={handleLineDrag}
                drawings={drawings}
                activeDrawingTool={activeDrawingTool}
                onDrawingCreated={handleDrawingCreated}
                onDrawingUpdated={handleDrawingUpdated}
                onDrawingSelectedChange={setSelectedDrawingIds}
                onDeleteSelectedDrawings={handleDeleteSelectedDrawings}
                defaultDrawingColor={defaultDrawingColor}
                selectMode={selectMode}
                magnetEnabled={magnetEnabled}
                crosshairEnabled={crosshairEnabled}
                hasMoreHistory={hasMoreHistory}
                loadingOlderBars={loadingOlderBars}
                onRequestOlderBars={handleRequestOlderBars}
                positions={positions}
                currency={account?.currency}
                symbolMeta={symbol}
                wsConnected={wsConnected}
                eaConnected={eaConnected}
              />
            </div>
          </div>

          {/* Drag-resize (Amir: give the desired space to the desired
              section) — hidden in fullscreen, where the panel is instead a
              fixed-size hover overlay (see EdgeReveal below); resizing a
              fixed-position overlay isn't a meaningful interaction there. */}
          {!isFullscreen && <ResizeHandle orientation="vertical" label={t("resizeMoneyPanel")} {...moneyPanelDrag} />}

          <EdgeReveal active={isFullscreen} edge="right" size={moneyPanelWidth}>
            <div className={isFullscreen ? "h-full p-3" : "h-full"} style={isFullscreen ? undefined : { width: moneyPanelWidth }}>
              <MoneyPanel
                plan={plan}
                reviewing={reviewing}
                riskResult={riskResult}
                riskError={riskError}
                previewPending={previewPending}
                busy={confirmBusy}
                currency={account?.currency}
                digits={digits}
                onRiskModeChange={setRiskMode}
                onRiskValueChange={setRiskValue}
                onPlacementChange={setPlacement}
                onRrRatioChange={setRrRatio}
                onBuy={() => startReview("buy")}
                onSell={() => startReview("sell")}
                onConfirm={() => void runConfirmOrder()}
                onCancel={cancelReview}
              />
            </div>
          </EdgeReveal>
        </div>

        {!isFullscreen && <ResizeHandle orientation="horizontal" label={t("resizePositionsBar")} {...positionsBarDrag} />}

        <EdgeReveal active={isFullscreen} edge="bottom" size={positionsBarHeight}>
          <div
            className={isFullscreen ? "h-full p-3" : ""}
            style={isFullscreen ? undefined : { height: positionsBarHeight }}
          >
            <PositionsBar
              positions={positions}
              pendingOrders={pendingOrders}
              symbol={symbol}
              onClose={closePosition}
              onClosePartial={closePositionPartial}
              onRiskFree={handleRiskFree}
              onCancelPending={cancelPending}
            />
          </div>
        </EdgeReveal>
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

      {tab === "settings" && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          onCheckForUpdate={checkForUpdate}
          onApplyUpdate={applyUpdate}
          updateProgress={updateProgress}
        />
      )}
    </main>
  );
}
