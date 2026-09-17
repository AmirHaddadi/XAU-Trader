"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountSnapshot,
  Bar,
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  PositionInfo,
  RiskResult,
  SymbolMeta,
  Tick,
  TradePlan,
} from "@xau-trader/protocol";
import { BRIDGE_WS_URL } from "./config";

const RECONNECT_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 5000;

export interface OrderAck {
  ok: boolean;
  message: string;
  ticket?: number;
}

export interface BridgeState {
  wsConnected: boolean;
  eaConnected: boolean;
  tick: Tick | undefined;
  account: AccountSnapshot | undefined;
  symbol: SymbolMeta | undefined;
  positions: PositionInfo[];
  bars: Bar[];
  barsTimeframe: string | undefined;
  lastError: string | undefined;
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
  lastError: undefined,
};

function newReqId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// Owns the single WebSocket connection to the bridge for the whole app.
// Live pushes (tick/account/symbol/positions/bars) land in React state;
// request/response actions (risk preview, order actions) go through a
// promise-based reqId correlation instead, since callers need to know
// success/failure of one specific action rather than a running state value.
export function useBridgeSocket() {
  const [state, setState] = useState<BridgeState>(initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, (msg: BridgeToBrowserMessage) => void>());

  const send = useCallback((msg: BrowserToBridgeMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const request = useCallback(
    (msg: BrowserToBridgeMessage): Promise<BridgeToBrowserMessage> => {
      const reqId = msg.reqId ?? newReqId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(reqId);
          reject(new Error(`${msg.type} timed out`));
        }, REQUEST_TIMEOUT_MS);
        pendingRef.current.set(reqId, (res) => {
          clearTimeout(timer);
          resolve(res);
        });
        send({ ...msg, reqId } as BrowserToBridgeMessage);
      });
    },
    [send],
  );

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
      if (msg.reqId && pendingRef.current.has(msg.reqId)) {
        pendingRef.current.get(msg.reqId)!(msg);
        pendingRef.current.delete(msg.reqId);
        return;
      }

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
        case "error":
          setState((s) => ({ ...s, lastError: msg.payload.message }));
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

  const previewRisk = useCallback(
    async (plan: TradePlan): Promise<RiskResult> => {
      const res = await request({ type: "risk.preview", payload: { plan } });
      if (res.type === "error") throw new Error(res.payload.message);
      if (res.type !== "risk.result") throw new Error(`unexpected response: ${res.type}`);
      return res.payload;
    },
    [request],
  );

  const sendOrder = useCallback(
    async (plan: TradePlan): Promise<OrderAck> => {
      const res = await request({ type: "order.send", payload: { plan } });
      if (res.type === "error") throw new Error(res.payload.message);
      if (res.type !== "order.ack") throw new Error(`unexpected response: ${res.type}`);
      return res.payload;
    },
    [request],
  );

  const modifyPendingOrder = useCallback(
    async (ticket: number, price: number, sl: number, tp: number): Promise<OrderAck> => {
      const res = await request({ type: "order.modifyPending", payload: { ticket, price, sl, tp } });
      if (res.type === "error") throw new Error(res.payload.message);
      if (res.type !== "order.ack") throw new Error(`unexpected response: ${res.type}`);
      return res.payload;
    },
    [request],
  );

  const closePosition = useCallback(
    async (ticket: number): Promise<OrderAck> => {
      const res = await request({ type: "order.close", payload: { ticket } });
      if (res.type === "error") throw new Error(res.payload.message);
      if (res.type !== "order.ack") throw new Error(`unexpected response: ${res.type}`);
      return res.payload;
    },
    [request],
  );

  const cancelPending = useCallback(
    async (ticket: number): Promise<OrderAck> => {
      const res = await request({ type: "order.cancel", payload: { ticket } });
      if (res.type === "error") throw new Error(res.payload.message);
      if (res.type !== "order.ack") throw new Error(`unexpected response: ${res.type}`);
      return res.payload;
    },
    [request],
  );

  // Fire-and-forget, coalesced EA-side — see CBridgeHandlers. No ack; the
  // confirmed sl/tp arrives via the next `positions` push.
  const modifyPosition = useCallback(
    (ticket: number, sl: number, tp: number) => {
      send({ type: "order.modifyPosition", payload: { ticket, sl, tp } });
    },
    [send],
  );

  return {
    ...state,
    requestBars,
    previewRisk,
    sendOrder,
    modifyPendingOrder,
    modifyPosition,
    closePosition,
    cancelPending,
  };
}
