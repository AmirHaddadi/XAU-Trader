// Standalone dev harness: stands in for the browser client to verify the
// bridge's WS relay/proxy logic (including the bars.request -> EA -> bars.data
// round trip) without needing apps/web running.
//
// Usage: pnpm --filter @xau-trader/bridge exec tsx scripts/fake-browser.ts
import WebSocket from "ws";
import type { BridgeToBrowserMessage } from "@xau-trader/protocol";

const URL = process.env.BRIDGE_WS_URL ?? "ws://127.0.0.1:8787/ws";
const ws = new WebSocket(URL);

ws.on("open", () => {
  console.log(`[fake-browser] connected to ${URL}`);
  setTimeout(() => {
    console.log("[fake-browser] -> bars.request");
    ws.send(JSON.stringify({ type: "bars.request", reqId: "test-1", payload: { symbol: "XAUUSD", timeframe: "M1", count: 5 } }));
  }, 500);
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString("utf8")) as BridgeToBrowserMessage;
  console.log("[fake-browser] <-", msg.type, msg.payload);
});

ws.on("error", (err) => console.error("[fake-browser] error:", err.message));
ws.on("close", () => console.log("[fake-browser] connection closed"));
