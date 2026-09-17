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

// Response to BridgeBarsRequest
export type EaBarsData = EaEnvelope<
  "bars.data",
  { symbol: string; timeframe: string; bars: Bar[] }
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

export type BridgeBarsRequest = EaEnvelope<
  "bars.request",
  { symbol: string; timeframe: string; count: number }
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

export type BridgeOrderCancel = EaEnvelope<"order.cancel", { ticket: number }>;

export type BridgeHistoryRequest = EaEnvelope<"history.request", { sinceTicket?: number }>;

export type BridgeToEaMessage =
  | BridgeBarsRequest
  | BridgeRiskPreview
  | BridgeOrderSend
  | BridgeOrderModifyPending
  | BridgeOrderModifyPosition
  | BridgeOrderClose
  | BridgeOrderCancel
  | BridgeHistoryRequest;
