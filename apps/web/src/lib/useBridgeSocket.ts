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
  UpdateCheckResult,
  UpdateProgressStage,
} from "@xau-trader/protocol";
import { BRIDGE_WS_URL } from "./config";

const RECONNECT_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 5000;
// App-level heartbeat: the browser's WebSocket API never exposes protocol
// ping/pong frames to JS, so a network drop with no clean FIN (sleep/wake,
// wifi loss) can leave `readyState === OPEN` forever with `onclose` never
// firing — the reconnect loop below then never kicks in and the app looks
// "connected" but frozen until the user manually refreshes. Sending our own
// ping and requiring a pong back within this window is what actually
// detects that case.
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 5000;

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
  // True until a history page request (offset > 0) comes back with nothing
  // new — i.e. CopyRates has genuinely run out of bars for this broker/
  // symbol/timeframe. Drives when LiveChart stops requesting more as the
  // user pans back.
  hasMoreHistory: boolean;
  loadingOlderBars: boolean;
  // How many bars at the front of `bars` were just prepended by a history
  // page (0 after a fresh load/timeframe switch). LiveChart reads this to
  // pick the edge-preserving reveal animation over the full-dataset one —
  // see lib/chartReveal.ts.
  barsAppendedOlderCount: number;
  // Bumped whenever `bars` was just silently replaced by a reconnect resync
  // (see the connect effect below) rather than a genuine fresh load/
  // timeframe switch. LiveChart watches this to apply the update without
  // any animation or view change — the user never asked for this refresh
  // and their pan/zoom/position on the chart must not move because of it.
  barsResyncEpoch: number;
  lastError: string | undefined;
  settings: Settings | undefined;
  journalDeals: ClosedDeal[];
  journalComments: Record<number, JournalComment[]>;
  // Set only while an update.apply is actually running — see selfUpdate.ts
  // on the bridge. The bridge process exits partway through that sequence,
  // so this just holds whichever stage arrived last until the WebSocket
  // drops (wsConnected flips false) and the normal reconnect loop picks the
  // restarted instance back up.
  updateProgress: { stage: UpdateProgressStage; message?: string } | undefined;
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
  hasMoreHistory: true,
  loadingOlderBars: false,
  barsAppendedOlderCount: 0,
  barsResyncEpoch: 0,
  lastError: undefined,
  settings: undefined,
  journalDeals: [],
  journalComments: {},
  updateProgress: undefined,
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
  // The last "current view" bars.request (offset 0) issued by requestBars —
  // not history-page requests. Replayed on reconnect to re-establish the
  // EA-side live subscription; see the connect effect below.
  const lastBarsRequestRef = useRef<{ symbol: string; timeframe: string; count: number } | undefined>(undefined);

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
    // Persists across reconnect attempts (unlike the per-attempt locals
    // inside connect()) — false only for the very first connection ever
    // made on this page load.
    let hasConnectedBefore = false;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(BRIDGE_WS_URL);
      wsRef.current = socket;

      // Reset fresh for every connection attempt.
      let resyncPending = false;
      let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
      let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;

      function stopHeartbeat() {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
        heartbeatInterval = undefined;
        heartbeatTimeout = undefined;
      }

      function startHeartbeat() {
        heartbeatInterval = setInterval(() => {
          if (socket?.readyState !== WebSocket.OPEN) return;
          send({ type: "ping", payload: {} });
          heartbeatTimeout = setTimeout(() => {
            // No pong within the window — treat the connection as dead and
            // force it closed so the reconnect loop below takes over. See
            // HEARTBEAT_* constants above for why this is necessary at all.
            socket?.close();
          }, HEARTBEAT_TIMEOUT_MS);
        }, HEARTBEAT_INTERVAL_MS);
      }

      // Clears any stale "restarting" progress from a prior update.apply —
      // a fresh connection (first load, or the reconnect after the bridge
      // actually restarted) means whatever that was is over.
      socket.onopen = () => {
        setState((s) => ({ ...s, wsConnected: true, updateProgress: undefined }));
        startHeartbeat();
        // A reconnect (not the first-ever connection): if the bridge
        // process itself restarted, its in-memory EA-side live bar.update
        // subscription is gone even though our own `bars`/`liveBar` state
        // survived client-side — silently re-request the current view so
        // live candles keep flowing without the user having to switch
        // timeframe or refresh. Tagged as a resync (resyncPending) so the
        // bars.data handler below applies it without disturbing the user's
        // current pan/zoom (see barsResyncEpoch / LiveChart).
        if (hasConnectedBefore && lastBarsRequestRef.current) {
          resyncPending = true;
          send({ type: "bars.request", payload: { ...lastBarsRequestRef.current, offset: 0 } });
        }
        hasConnectedBefore = true;
      };
      socket.onclose = () => {
        stopHeartbeat();
        setState((s) => ({ ...s, wsConnected: false, eaConnected: false }));
        if (!cancelled) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => socket?.close();
      socket.onmessage = (ev) => handleMessage(JSON.parse(ev.data as string) as BridgeToBrowserMessage);

      function handleMessage(msg: BridgeToBrowserMessage) {
        if (msg.type === "pong") {
          if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
          heartbeatTimeout = undefined;
          return;
        }
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
          setState((s) => {
            if (msg.payload.offset === 0) {
              const wasResync = resyncPending;
              resyncPending = false;
              if (wasResync && msg.payload.timeframe === s.barsTimeframe) {
                // Reconnect resync landing for the same view the user is
                // already looking at — replace the data silently
                // (barsResyncEpoch bump, not a fresh-load full-fit) so
                // LiveChart re-applies it without moving the chart. See
                // the onopen handler above.
                return {
                  ...s,
                  bars: msg.payload.bars,
                  liveBar: undefined,
                  hasMoreHistory: true,
                  loadingOlderBars: false,
                  barsAppendedOlderCount: 0,
                  barsResyncEpoch: s.barsResyncEpoch + 1,
                };
              }
              // Initial load / refresh / genuine timeframe or symbol switch
              // — full replace, chart is allowed to re-fit.
              return {
                ...s,
                bars: msg.payload.bars,
                barsTimeframe: msg.payload.timeframe,
                liveBar: undefined,
                hasMoreHistory: true,
                loadingOlderBars: false,
                barsAppendedOlderCount: 0,
              };
            }
            // A history page requested as the user panned back — prepend,
            // deduping on the (rare) chance the boundary bar was returned
            // by both requests.
            if (msg.payload.timeframe !== s.barsTimeframe) return { ...s, loadingOlderBars: false };
            const existingTimes = new Set(s.bars.map((b) => b.time));
            const older = msg.payload.bars.filter((b) => !existingTimes.has(b.time));
            return {
              ...s,
              bars: [...older, ...s.bars],
              hasMoreHistory: msg.payload.bars.length > 0,
              loadingOlderBars: false,
              barsAppendedOlderCount: older.length,
            };
          });
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
        case "update.progress":
          setState((s) => ({ ...s, updateProgress: msg.payload }));
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
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
    // `send` has a stable identity (its own deps are []); listed for
    // correctness, not because it ever changes and re-runs this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  const requestBars = useCallback(
    (symbol: string, timeframe: string, count: number, offset = 0) => {
      // Only the "current view" request (offset 0) is worth replaying on a
      // reconnect — history pages are opportunistic, not something the live
      // feed depends on. See lastBarsRequestRef's use in the connect effect.
      if (offset === 0) lastBarsRequestRef.current = { symbol, timeframe, count };
      if (offset > 0) setState((s) => ({ ...s, loadingOlderBars: true }));
      send({ type: "bars.request", payload: { symbol, timeframe, count, offset } });
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

  const checkForUpdate = useCallback(async (): Promise<UpdateCheckResult> => {
    const res = await request({ type: "update.check", payload: {} });
    if (res.type === "error") throw new Error(res.payload.message);
    if (res.type !== "update.result") throw new Error(`unexpected response: ${res.type}`);
    return res.payload;
  }, [request]);

  // Fire-and-forget — the bridge process exits partway through applying an
  // update (see selfUpdate.ts), so there's no response to correlate;
  // progress comes back as update.progress pushes instead (see above).
  const applyUpdate = useCallback(() => {
    send({ type: "update.apply", payload: {} });
  }, [send]);

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
    checkForUpdate,
    applyUpdate,
  };
}
