"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountSnapshot,
  Bar,
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  ClosedDeal,
  JournalComment,
  PositionInfo,
  RiskResult,
  Settings,
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
  // Separate from `bars` deliberately: `bars` only changes on a genuine
  // full reload (initial load / timeframe switch), so the chart can
  // setData()+fitContent() just for those. `liveBar` changes on every
  // bar.update push (multiple times a second) and is applied via the
  // chart's incremental series.update() instead — merging it into `bars`
  // meant every live tick re-ran setData()+fitContent(), which reset the
  // user's zoom/pan on every update (the root cause of the chart feeling
  // "stuck"/unusable — see Fix-Bugs.md item 9).
  liveBar: Bar | undefined;
  lastError: string | undefined;
  settings: Settings | undefined;
  journalDeals: ClosedDeal[];
  journalComments: Record<number, JournalComment[]>;
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
  liveBar: undefined,
  lastError: undefined,
  settings: undefined,
  journalDeals: [],
  journalComments: {},
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
          setState((s) => ({ ...s, bars: msg.payload.bars, barsTimeframe: msg.payload.timeframe, liveBar: undefined }));
          return;
        case "bar.update":
          setState((s) => (s.barsTimeframe === msg.payload.timeframe ? { ...s, liveBar: msg.payload.bar } : s));
          return;
        case "error":
          setState((s) => ({ ...s, lastError: msg.payload.message }));
          return;
        case "settings.data":
          setState((s) => ({ ...s, settings: msg.payload }));
          return;
        case "journal.update":
          setState((s) => {
            const byTicket = new Map(s.journalDeals.map((d) => [d.dealTicket, d]));
            for (const deal of msg.payload.deals) byTicket.set(deal.dealTicket, deal);
            const journalDeals = [...byTicket.values()].sort((a, b) => b.timeClose - a.timeClose);
            return { ...s, journalDeals };
          });
          return;
        case "journal.data":
          setState((s) => ({ ...s, journalDeals: msg.payload.deals }));
          return;
        case "journal.comments":
          setState((s) => ({
            ...s,
            journalComments: { ...s.journalComments, [msg.payload.dealTicket]: msg.payload.comments },
          }));
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

  const updateSettings = useCallback(
    (partial: Partial<Settings>) => {
      // Fire-and-forget — the bridge broadcasts the updated settings.data
      // back to every tab (including this one), which is what actually
      // updates state; no need to also apply it optimistically here.
      send({ type: "settings.update", payload: partial });
    },
    [send],
  );

  const requestJournal = useCallback(
    (filter: { search?: string; from?: number; to?: number } = {}) => {
      send({ type: "journal.request", payload: filter });
    },
    [send],
  );

  const requestComments = useCallback(
    (dealTicket: number) => {
      send({ type: "journal.comments.request", payload: { dealTicket } });
    },
    [send],
  );

  const addJournalComment = useCallback(
    (dealTicket: number, body: string) => {
      send({ type: "journal.comment.add", payload: { dealTicket, body } });
    },
    [send],
  );

  const editJournalComment = useCallback(
    (dealTicket: number, id: number, body: string) => {
      send({ type: "journal.comment.edit", payload: { id, body } });
      // No server ack for edit/delete (see wsServer) — update optimistically.
      setState((s) => ({
        ...s,
        journalComments: {
          ...s.journalComments,
          [dealTicket]: (s.journalComments[dealTicket] ?? []).map((c) => (c.id === id ? { ...c, body } : c)),
        },
      }));
    },
    [send],
  );

  const deleteJournalComment = useCallback(
    (dealTicket: number, id: number) => {
      send({ type: "journal.comment.delete", payload: { id } });
      setState((s) => ({
        ...s,
        journalComments: {
          ...s.journalComments,
          [dealTicket]: (s.journalComments[dealTicket] ?? []).filter((c) => c.id !== id),
        },
      }));
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
    updateSettings,
    requestJournal,
    requestComments,
    addJournalComment,
    editJournalComment,
    deleteJournalComment,
  };
}
