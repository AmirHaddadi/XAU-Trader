"use client";

import { useEffect, useRef } from "react";
import { useBridgeSocket } from "@/lib/useBridgeSocket";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { AccountBar } from "@/components/AccountBar";
import { PositionsBar } from "@/components/PositionsBar";
import { LiveChart } from "@/components/LiveChart";

const DEFAULT_TIMEFRAME = "M1";
const DEFAULT_BAR_COUNT = 500;

export default function DashboardPage() {
  const { wsConnected, eaConnected, tick, account, symbol, positions, bars, requestBars } = useBridgeSocket();
  const requestedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (symbol?.valid && requestedFor.current !== symbol.symbol) {
      requestedFor.current = symbol.symbol;
      requestBars(symbol.symbol, DEFAULT_TIMEFRAME, DEFAULT_BAR_COUNT);
    }
  }, [symbol, requestBars]);

  return (
    <main className="flex h-dvh flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold text-accent-gold">XAU Trader</h1>
          <span className="text-sm text-text-muted">{symbol?.symbol ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge label="Bridge" connected={wsConnected} />
          <ConnectionBadge label="MT5 EA" connected={eaConnected} />
        </div>
      </header>

      <AccountBar account={account} symbol={symbol} tick={tick} />

      <div className="min-h-0 flex-1 rounded-lg border border-border bg-card p-2">
        <LiveChart bars={bars} />
      </div>

      <PositionsBar positions={positions} symbol={symbol} />
    </main>
  );
}
