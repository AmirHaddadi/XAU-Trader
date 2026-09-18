// EA <-> Bridge wire protocol: newline-delimited JSON over a raw TCP socket.
// The EA is always the connecting client (MQL5 sockets are client-only); the
// bridge is the listener. One JSON object per line, no other framing.
//
// Every envelope carries `type`. Request/response pairs additionally carry a
// `reqId` set by the requester and echoed back by the responder, so either
// side can correlate an async reply without blocking the connection.

import type {
  AccountSnapshot,
  Bar,
  ClosedDeal,
  PositionInfo,
  RiskResult,
  SymbolMeta,
  Tick,
  TradePlan,
} from "./domain.js";

export interface EaEnvelope<TType extends string, TPayload> {
  type: TType;
  reqId?: string;
  payload: TPayload;
}

// ---- EA -> Bridge (push, or response to a Bridge -> EA request) ----------

export type EaHello = EaEnvelope<
  "hello",
  {
    account: number;
    broker: string;
    symbol: string;
    magic: number;
    eaVersion: string;
  }
>;

export type EaTick = EaEnvelope<"tick", Tick>;

export type EaBarUpdate = EaEnvelope<"bar.update", { symbol: string; timeframe: string; bar: Bar }>;

// Response to BridgeBarsRequest. `offset` is echoed back from the request
// so the client can tell an initial/refresh load (0 — replace) apart from
// an older-history page (>0 — prepend); see BridgeBarsRequest.
export type EaBarsData = EaEnvelope<
  "bars.data",
  { symbol: string; timeframe: string; bars: Bar[]; offset: number }
>;

// Response to BridgeRiskPreview
export type EaRiskResult = EaEnvelope<"risk.result", RiskResult>;

// Response to any Bridge -> EA order.* request
export type EaOrderAck = EaEnvelope<
  "order.ack",
  { ok: boolean; message: string; ticket?: number }
>;

export type EaPositions = EaEnvelope<"positions", { positions: PositionInfo[] }>;

export type EaAccount = EaEnvelope<"account", AccountSnapshot>;

export type EaSymbol = EaEnvelope<"symbol", SymbolMeta>;

export type EaHistoryNewDeals = EaEnvelope<"history.newDeals", { deals: ClosedDeal[] }>;

// Response to BridgeHistoryRequest
export type EaHistoryData = EaEnvelope<"history.data", { deals: ClosedDeal[] }>;

export type EaError = EaEnvelope<"error", { message: string }>;
export type EaLog = EaEnvelope<"log", { level: "info" | "warn" | "error"; message: string }>;

export type EaToBridgeMessage =
  | EaHello
  | EaTick
  | EaBarUpdate
  | EaBarsData
  | EaRiskResult
  | EaOrderAck
  | EaPositions
  | EaAccount
  | EaSymbol
  | EaHistoryNewDeals
  | EaHistoryData
  | EaError
  | EaLog;

// ---- Bridge -> EA (requests, correlated by reqId) -------------------------

// `offset` maps straight to MQL5's CopyRates(symbol, tf, start_pos, count,
// rates) — 0 (default) is the most recent `count` bars and also (re)sets
// the EA's live bar.update subscription for this symbol/timeframe; a
// positive offset pages further into the past (the web client's own
// currently-loaded bar count) without touching that subscription, for
// infinite-scroll-style history loading as the user pans back.
export type BridgeBarsRequest = EaEnvelope<
  "bars.request",
  { symbol: string; timeframe: string; count: number; offset?: number }
>;

export type BridgeRiskPreview = EaEnvelope<"risk.preview", { plan: TradePlan }>;

export type BridgeOrderSend = EaEnvelope<"order.send", { plan: TradePlan }>;

export type BridgeOrderModifyPending = EaEnvelope<
  "order.modifyPending",
  { ticket: number; price: number; sl: number; tp: number }
>;

export type BridgeOrderModifyPosition = EaEnvelope<
  "order.modifyPosition",
  { ticket: number; sl: number; tp: number }
>;

export type BridgeOrderClose = EaEnvelope<"order.close", { ticket: number }>;

export type BridgeOrderClosePartial = EaEnvelope<"order.closePartial", { ticket: number; volume: number }>;

export type BridgeOrderCancel = EaEnvelope<"order.cancel", { ticket: number }>;

export type BridgeHistoryRequest = EaEnvelope<"history.request", { sinceTicket?: number }>;

export type BridgeToEaMessage =
  | BridgeBarsRequest
  | BridgeRiskPreview
  | BridgeOrderSend
  | BridgeOrderModifyPending
  | BridgeOrderModifyPosition
  | BridgeOrderClose
  | BridgeOrderClosePartial
  | BridgeOrderCancel
  | BridgeHistoryRequest;
