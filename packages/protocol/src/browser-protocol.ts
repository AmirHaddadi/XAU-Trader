// Bridge <-> Browser wire protocol: a real WebSocket. Mostly a relay of the
// EA protocol (see ea-protocol.ts) plus bridge-local concerns that never
// round-trip to MT5: journal comments, settings, and connection state.

import type {
  AccountSnapshot,
  AppLang,
  AppTheme,
  Bar,
  ClosedDeal,
  Drawing,
  JournalComment,
  PlacementType,
  PositionInfo,
  RiskMode,
  RiskResult,
  SymbolMeta,
  Tick,
  TradePlan,
} from "./domain.js";

export interface WsEnvelope<TType extends string, TPayload> {
  type: TType;
  reqId?: string;
  payload: TPayload;
}

// ---- Bridge -> Browser (push, or response to a Browser -> Bridge request) -

export type WsEaStatus = WsEnvelope<"ea.status", { connected: boolean }>;
export type WsTick = WsEnvelope<"tick", Tick>;
export type WsBarUpdate = WsEnvelope<"bar.update", { symbol: string; timeframe: string; bar: Bar }>;
export type WsBarsData = WsEnvelope<"bars.data", { symbol: string; timeframe: string; bars: Bar[]; offset: number }>;
export type WsRiskResult = WsEnvelope<"risk.result", RiskResult>;
export type WsOrderAck = WsEnvelope<"order.ack", { ok: boolean; message: string; ticket?: number }>;
export type WsPositions = WsEnvelope<"positions", { positions: PositionInfo[] }>;
export type WsAccount = WsEnvelope<"account", AccountSnapshot>;
export type WsSymbol = WsEnvelope<"symbol", SymbolMeta>;

export type WsJournalUpdate = WsEnvelope<"journal.update", { deals: ClosedDeal[] }>;
export type WsJournalData = WsEnvelope<"journal.data", { deals: ClosedDeal[] }>;
export type WsJournalComments = WsEnvelope<"journal.comments", { dealTicket: number; comments: JournalComment[] }>;

export interface Settings {
  theme: AppTheme;
  lang: AppLang;
  riskMode: RiskMode;
  riskValue: number;
  placement: PlacementType;
  rrRatio: number;
  chartTimeframe: string;
  chartGridVisible: boolean;
  chartDrawings: Drawing[];
}

export type WsSettings = WsEnvelope<"settings.data", Settings>;
export type WsError = WsEnvelope<"error", { message: string }>;

// Deliberately just a version comparison + a yes/no — never a release URL,
// asset name, or anything else that would tell a browser-devtools-inspecting
// user where this app's source lives. That lookup (and the actual
// download+install) happens entirely inside the bridge process — see
// apps/bridge/src/{updateCheck,selfUpdate}.ts.
export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}
export type WsUpdateResult = WsEnvelope<"update.result", UpdateCheckResult>;

// Pushed (not a reqId-correlated response) while applyUpdate() runs in the
// bridge — the process exits itself partway through this sequence (see
// selfUpdate.ts) so there's no single "final" response to correlate to
// anyway; the browser just renders whichever stage arrives last until the
// WebSocket drops, then its normal reconnect logic (useBridgeSocket.ts)
// picks the new instance back up once it's listening again.
export type UpdateProgressStage = "downloading" | "installing" | "restarting" | "error";
export type WsUpdateProgress = WsEnvelope<"update.progress", { stage: UpdateProgressStage; message?: string }>;

export type BridgeToBrowserMessage =
  | WsEaStatus
  | WsTick
  | WsBarUpdate
  | WsBarsData
  | WsRiskResult
  | WsOrderAck
  | WsPositions
  | WsAccount
  | WsSymbol
  | WsJournalUpdate
  | WsJournalData
  | WsJournalComments
  | WsSettings
  | WsUpdateResult
  | WsUpdateProgress
  | WsError;

// ---- Browser -> Bridge (requests, correlated by reqId where meaningful) --

export type BrowserBarsRequest = WsEnvelope<"bars.request", { symbol: string; timeframe: string; count: number; offset?: number }>;
export type BrowserRiskPreview = WsEnvelope<"risk.preview", { plan: TradePlan }>;
export type BrowserOrderSend = WsEnvelope<"order.send", { plan: TradePlan }>;
export type BrowserOrderModifyPending = WsEnvelope<"order.modifyPending", { ticket: number; price: number; sl: number; tp: number }>;
export type BrowserOrderModifyPosition = WsEnvelope<"order.modifyPosition", { ticket: number; sl: number; tp: number }>;
export type BrowserOrderClose = WsEnvelope<"order.close", { ticket: number }>;
export type BrowserOrderCancel = WsEnvelope<"order.cancel", { ticket: number }>;

export type BrowserJournalRequest = WsEnvelope<"journal.request", { search?: string; from?: number; to?: number }>;
export type BrowserJournalCommentAdd = WsEnvelope<"journal.comment.add", { dealTicket: number; body: string }>;
export type BrowserJournalCommentEdit = WsEnvelope<"journal.comment.edit", { id: number; body: string }>;
export type BrowserJournalCommentDelete = WsEnvelope<"journal.comment.delete", { id: number }>;
export type BrowserJournalCommentsRequest = WsEnvelope<"journal.comments.request", { dealTicket: number }>;

export type BrowserSettingsUpdate = WsEnvelope<"settings.update", Partial<Settings>>;
export type BrowserSettingsRequest = WsEnvelope<"settings.request", Record<string, never>>;

export type BrowserUpdateCheck = WsEnvelope<"update.check", Record<string, never>>;
// Fire-and-forget by design — see WsUpdateProgress above for why there's no
// matching response type.
export type BrowserUpdateApply = WsEnvelope<"update.apply", Record<string, never>>;

export type BrowserToBridgeMessage =
  | BrowserBarsRequest
  | BrowserRiskPreview
  | BrowserOrderSend
  | BrowserOrderModifyPending
  | BrowserOrderModifyPosition
  | BrowserOrderClose
  | BrowserOrderCancel
  | BrowserJournalRequest
  | BrowserJournalCommentAdd
  | BrowserJournalCommentEdit
  | BrowserJournalCommentDelete
  | BrowserJournalCommentsRequest
  | BrowserSettingsUpdate
  | BrowserSettingsRequest
  | BrowserUpdateCheck
  | BrowserUpdateApply;
