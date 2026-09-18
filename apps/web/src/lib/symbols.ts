// Symbols the EA will service on request (see the "symbol.select" message in
// @xau-trader/protocol's browser-protocol.ts/ea-protocol.ts). XAUUSD is the
// primary/home symbol; BTCUSD/ETHUSD exist purely so there's something
// tradeable to test/develop against on weekends and holidays, when the gold
// market itself is closed — crypto CFDs typically keep quoting. The EA
// switches its single "active" trading symbol on request rather than
// running multiple symbols at once (see XAU_Trader.mq5's g_activeSymbol) —
// only one symbol's positions/ticks/journal are visible at a time, exactly
// like before this existed.
//
// Deliberately lives here (frontend-only), not in packages/protocol: the
// bridge and EA already accept any symbol string generically (no whitelist
// enforced server-side), so nothing outside the UI actually needs this list
// as a runtime value — and packages/protocol has never shipped a runtime
// value before (types only), which broke Turbopack's barrel bundling
// (`export * from "./domain.js"` chain) the one time this was tried there.
export const SYMBOL_WATCHLIST = ["XAUUSD", "BTCUSD", "ETHUSD"] as const;
