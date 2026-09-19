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
  PendingOrderInfo,
  PlacementType,
  PositionInfo,
  RiskMode,
  RiskResult,
  SymbolMeta,
  ThemeColorTokens,
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
// Relayed straight through from EaPendingOrders on the same cadence/
// triggers as WsPositions — see ea-protocol.ts's EaPendingOrders.
export type WsPendingOrders = WsEnvelope<"pendingOrders", { orders: PendingOrderInfo[] }>;
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
  magnetEnabled: boolean;
  // Per-theme color overrides (see domain.ts's ThemeColorTokens) — kept
  // separate per Amir's explicit choice, so a color picked while editing
  // Dark never leaks into Light (defaults for the two themes are already
  // quite different — see globals.css).
  customColorsDark: Partial<ThemeColorTokens>;
  customColorsLight: Partial<ThemeColorTokens>;
  // "Pips" here is deliberately just raw symbol.point units (Amir's own
  // wording: whatever the user enters is treated as points) — 0 is a valid
  // value (SL exactly at entry).
  riskFreePips: number;
  riskFreeConsiderSpread: boolean;
  // Whether the chart's built-in dashed crosshair guide lines render at
  // all (see LiveChart.tsx's CrosshairMode.Hidden branch) — the toolbar
  // toggle next to Magnet. Defaults true so existing behavior (the
  // library's own out-of-the-box crosshair) is unchanged until a user
  // explicitly turns it off.
  crosshairEnabled: boolean;
  // Last symbol.select the user made (see SYMBOL_WATCHLIST in domain.ts).
  // "" means no explicit selection yet — the EA starts on whatever symbol
  // its chart is attached to (XAUUSD in practice). Persisted purely so a
  // bridge/EA restart re-applies the same selection instead of silently
  // snapping back to XAUUSD mid-weekend-test (see wsServer.ts's eaLink
  // "connected" handler).
  activeSymbol: string;
  // The color the user most recently applied to a chart drawing (toolbar's
  // selection color picker) — every newly-placed drawing defaults to this
  // instead of always resetting to the theme accent, so picking a color
  // once "sticks" for the rest of the session (and across restarts).
  lastDrawingColor: string;
  // Chart-vs-MoneyPanel and chart-area-vs-PositionsBar split sizes, set by
  // dragging the resize handles between them (see lib/useResizable.ts).
  // Persisted like every other layout preference here so a reload doesn't
  // reset a deliberately-chosen layout.
  moneyPanelWidth: number;
  positionsBarHeight: number;
}

export type WsSettings = WsEnvelope<"settings.data", Settings>;
export type WsError = WsEnvelope<"error", { message: string }>;

// App-level heartbeat reply. The browser's WebSocket API gives no access to
// the protocol-level ping/pong frames the browser answers automatically, so
// a silently-dead connection (network drop with no clean FIN — laptop
// sleep/wake, wifi loss) can leave `readyState === OPEN` with `onclose`
// never firing, and the existing reconnect loop then never kicks in. This
// pong is what lets useBridgeSocket's own heartbeat timer detect that case
// and force a reconnect instead of requiring a manual page refresh.
export type WsPong = WsEnvelope<"pong", Record<string, never>>;

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
  | WsPendingOrders
  | WsAccount
  | WsSymbol
  | WsJournalUpdate
  | WsJournalData
  | WsJournalComments
  | WsSettings
  | WsUpdateResult
  | WsUpdateProgress
  | WsPong
  | WsError;

// ---- Browser -> Bridge (requests, correlated by reqId where meaningful) --

export type BrowserBarsRequest = WsEnvelope<"bars.request", { symbol: string; timeframe: string; count: number; offset?: number }>;
// Fire-and-forget — switches the EA's single "active" trading symbol (see
// SYMBOL_WATCHLIST). The bridge both persists it (Settings.activeSymbol)
// and forwards it to the EA; there's no direct ack, the confirmation is
// the next `symbol`/`tick`/`positions` push actually reflecting the new
// symbol (see wsServer.ts).
export type BrowserSymbolSelect = WsEnvelope<"symbol.select", { symbol: string }>;
export type BrowserRiskPreview = WsEnvelope<"risk.preview", { plan: TradePlan }>;
export type BrowserOrderSend = WsEnvelope<"order.send", { plan: TradePlan }>;
export type BrowserOrderModifyPending = WsEnvelope<"order.modifyPending", { ticket: number; price: number; sl: number; tp: number }>;
export type BrowserOrderModifyPosition = WsEnvelope<"order.modifyPosition", { ticket: number; sl: number; tp: number }>;
export type BrowserOrderClose = WsEnvelope<"order.close", { ticket: number }>;
export type BrowserOrderClosePartial = WsEnvelope<"order.closePartial", { ticket: number; volume: number }>;
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

// See WsPong above — the client-side half of the connection-liveness
// heartbeat.
export type BrowserPing = WsEnvelope<"ping", Record<string, never>>;

export type BrowserToBridgeMessage =
  | BrowserBarsRequest
  | BrowserSymbolSelect
  | BrowserRiskPreview
  | BrowserOrderSend
  | BrowserOrderModifyPending
  | BrowserOrderModifyPosition
  | BrowserOrderClose
  | BrowserOrderClosePartial
  | BrowserOrderCancel
  | BrowserJournalRequest
  | BrowserJournalCommentAdd
  | BrowserJournalCommentEdit
  | BrowserJournalCommentDelete
  | BrowserJournalCommentsRequest
  | BrowserSettingsUpdate
  | BrowserSettingsRequest
  | BrowserUpdateCheck
  | BrowserUpdateApply
  | BrowserPing;
