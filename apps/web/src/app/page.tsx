"use client";

import { useEffect, useMemo, useRef } from "react";
import { useBridgeSocket } from "@/lib/useBridgeSocket";
import { useTradePlan } from "@/lib/useTradePlan";
import type { DraggableLine } from "@/lib/priceLineDrag";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { AccountBar } from "@/components/AccountBar";
import { PositionsBar } from "@/components/PositionsBar";
import { LiveChart } from "@/components/LiveChart";
import { MoneyPanel } from "@/components/MoneyPanel";

const DEFAULT_TIMEFRAME = "M1";
const DEFAULT_BAR_COUNT = 500;

export default function DashboardPage() {
  const {
    wsConnected,
    eaConnected,
    tick,
    account,
    symbol,
    positions,
    bars,
    lastError,
    requestBars,
    previewRisk,
    sendOrder,
    modifyPosition,
    closePosition,
  } = useBridgeSocket();

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
  } = useTradePlan({ tick, symbol, previewRisk, sendOrder });

  const requestedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (symbol?.valid && requestedFor.current !== symbol.symbol) {
      requestedFor.current = symbol.symbol;
      requestBars(symbol.symbol, DEFAULT_TIMEFRAME, DEFAULT_BAR_COUNT);
    }
  }, [symbol, requestBars]);

  // Tracks each open position's latest known sl/tp locally, updated
  // optimistically as soon as a drag starts — otherwise dragging SL then TP
  // in quick succession (before the server round-trip confirms the first
  // one) would send a stale value for whichever field wasn't just touched.
  // Mirrors XAU_Trader.mq5's own g_posModifyDirty/g_posModifyTicket pattern
  // for exactly the same reason.
  const pendingPosRef = useRef(new Map<number, { sl: number; tp: number }>());
  useEffect(() => {
    for (const p of positions) pendingPosRef.current.set(p.ticket, { sl: p.sl, tp: p.tp });
  }, [positions]);

  const digits = symbol?.digits ?? 2;

  const lines = useMemo<DraggableLine[]>(() => {
    const result: DraggableLine[] = [];
    if (reviewing) {
      if (plan.placement !== "market" && plan.entryPrice > 0) {
        result.push({ id: "plan:entry", price: plan.entryPrice, color: "#d4af37", title: "Entry", draggable: true, dashed: true });
      }
      if (plan.slPrice > 0) result.push({ id: "plan:sl", price: plan.slPrice, color: "#ef4444", title: "SL", draggable: true, dashed: true });
      if (plan.tpPrice > 0) result.push({ id: "plan:tp", price: plan.tpPrice, color: "#22c55e", title: "TP", draggable: true, dashed: true });
    }
    for (const p of positions) {
      if (p.sl > 0) result.push({ id: `pos:${p.ticket}:sl`, price: p.sl, color: "#ef4444", title: `#${p.ticket} SL`, draggable: true });
      if (p.tp > 0) result.push({ id: `pos:${p.ticket}:tp`, price: p.tp, color: "#22c55e", title: `#${p.ticket} TP`, draggable: true });
    }
    return result;
  }, [reviewing, plan, positions]);

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
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold text-accent-gold">XAU Trader</h1>
          <span className="text-sm text-text-muted">{symbol?.symbol ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastError && <span className="text-xs" style={{ color: "var(--color-sell)" }}>{lastError}</span>}
          <ConnectionBadge label="Bridge" connected={wsConnected} />
          <ConnectionBadge label="MT5 EA" connected={eaConnected} />
        </div>
      </header>

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
    </main>
  );
}
