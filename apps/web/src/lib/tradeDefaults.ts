// Mirrors MQL5/Include/XAUTrader/Core/Defines.mqh's panel-convenience
// constants — these are UX defaults only (where to start dragging from),
// never authoritative. The EA's CRiskEngine::Evaluate (via risk.preview) is
// always the real validation, so a slightly-off default here just means the
// user drags a little further; it can't produce a wrong trade.
export const XAUT_DEFAULT_STOP_PERCENT = 0.1;
export const XAUT_DEFAULT_REWARD_RATIO = 2.0;
export const XAUT_RR_MIN = 1.0;
export const XAUT_RR_MAX = 5.0;
export const XAUT_RR_STEP = 0.5;
