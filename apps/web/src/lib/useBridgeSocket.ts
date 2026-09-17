"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountSnapshot,
  Bar,
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  PositionInfo,
  SymbolMeta,
  Tick,
} from "@xau-trader/protocol";
import { BRIDGE_WS_URL } from "./config";

const RECONNECT_DELAY_MS = 1500;

export interface BridgeState {
  wsConnected: boolean;
  eaConnected: boolean;
  tick: Tick | undefined;
  account: AccountSnapshot | undefined;
  symbol: SymbolMeta | undefined;
  positions: PositionInfo[];
  bars: Bar[];
  barsTimeframe: string | undefined;
}

const initialState: BridgeState = {
  wsConnected: false,
  eaConnected: false,
  tick: undefined,
  account: undefined,
  symbol: undefined,
  positions: [],
  bars: [],
  barsTimeframe: undefined,
};

// Owns the single WebSocket connection to the bridge for the whole app: EA
// data is read-only in Phase A (no order/risk/journal actions sent yet), so
// this hook only needs to relay pushes into React state and expose a way to
// request historical bars.
export function useBridgeSocket() {
  const [state, setState] = useState<BridgeState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: BrowserToBridgeMessage) => {
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(BRIDGE_WS_URL);
      wsRef.current = socket;

      socket.onopen = () => setState((s) => ({ ...s, wsConnected: true }));
      socket.onclose = () => {
        setState((s) => ({ ...s, wsConnected: false, eaConnected: false }));
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => socket?.close();
      socket.onmessage = (ev) => handleMessage(JSON.parse(ev.data as string) as BridgeToBrowserMessage);
    }

    function handleMessage(msg: BridgeToBrowserMessage) {
      switch (msg.type) {
        case "ea.status":
          setState((s) => ({ ...s, eaConnected: msg.payload.connected }));
          return;
        case "tick":
          setState((s) => ({ ...s, tick: msg.payload }));
          return;
        case "account":
          setState((s) => ({ ...s, account: msg.payload }));
          return;
        case "symbol":
          setState((s) => ({ ...s, symbol: msg.payload }));
          return;
        case "positions":
          setState((s) => ({ ...s, positions: msg.payload.positions }));
          return;
        case "bars.data":
          setState((s) => ({ ...s, bars: msg.payload.bars, barsTimeframe: msg.payload.timeframe }));
          return;
        case "bar.update":
          setState((s) => {
            if (s.barsTimeframe !== msg.payload.timeframe) return s;
            const bars = [...s.bars];
            const last = bars[bars.length - 1];
            if (last && last.time === msg.payload.bar.time) bars[bars.length - 1] = msg.payload.bar;
            else bars.push(msg.payload.bar);
            return { ...s, bars };
          });
          return;
        default:
          return;
      }
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const requestBars = useCallback(
    (symbol: string, timeframe: string, count: number) => {
      send({ type: "bars.request", payload: { symbol, timeframe, count } });
    },
    [send],
  );

  return { ...state, requestBars };
}
