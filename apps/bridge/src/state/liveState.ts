import type { AccountSnapshot, PositionInfo, SymbolMeta, Tick } from "@xau-trader/protocol";
import { eaLink } from "../tcp/eaLink.js";

// The latest-known snapshot of everything the EA pushes, so a browser tab
// that connects (or reconnects) mid-session gets an immediate picture
// instead of waiting for the next EA push cycle.
class LiveState {
  tick: Tick | undefined;
  positions: PositionInfo[] = [];
  account: AccountSnapshot | undefined;
  symbol: SymbolMeta | undefined;
  eaConnected = false;
}

export const liveState = new LiveState();

eaLink.on("connected", () => {
  liveState.eaConnected = true;
});
eaLink.on("disconnected", () => {
  liveState.eaConnected = false;
});
eaLink.on("tick", (msg: { payload: Tick }) => {
  liveState.tick = msg.payload;
});
eaLink.on("positions", (msg: { payload: { positions: PositionInfo[] } }) => {
  liveState.positions = msg.payload.positions;
});
eaLink.on("account", (msg: { payload: AccountSnapshot }) => {
  liveState.account = msg.payload;
});
eaLink.on("symbol", (msg: { payload: SymbolMeta }) => {
  liveState.symbol = msg.payload;
});
