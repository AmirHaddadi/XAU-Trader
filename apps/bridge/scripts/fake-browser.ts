// Standalone dev harness: stands in for the browser client to verify the
// bridge's WS relay/proxy logic (including the bars.request -> EA -> bars.data
// round trip) without needing apps/web running.
//
// Usage: pnpm --filter @xau-trader/bridge exec tsx scripts/fake-browser.ts
import WebSocket from "ws";
import type { BridgeToBrowserMessage } from "@xau-trader/protocol";

const URL = process.env.BRIDGE_WS_URL ?? "ws://127.0.0.1:8787/ws";
const ws = new WebSocket(URL);

const testPlan = {
  riskMode: "percent_balance",
  riskValue: 1,
  placement: "market",
  direction: "buy",
  entryPrice: 2400,
  slPrice: 2395,
  tpPrice: 2410,
  rrRatio: 2,
  slUserSet: true,
  tpUserSet: true,
};

ws.on("open", () => {
  console.log(`[fake-browser] connected to ${URL}`);
  setTimeout(() => {
    console.log("[fake-browser] -> bars.request");
    ws.send(JSON.stringify({ type: "bars.request", reqId: "test-1", payload: { symbol: "XAUUSD", timeframe: "M1", count: 5 } }));
  }, 500);
  setTimeout(() => {
    console.log("[fake-browser] -> risk.preview");
    ws.send(JSON.stringify({ type: "risk.preview", reqId: "test-2", payload: { plan: testPlan } }));
  }, 800);
  setTimeout(() => {
    console.log("[fake-browser] -> order.send");
    ws.send(JSON.stringify({ type: "order.send", reqId: "test-3", payload: { plan: testPlan } }));
  }, 1100);
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString("utf8")) as BridgeToBrowserMessage;
  console.log("[fake-browser] <-", msg.type, msg.payload);
});

ws.on("error", (err) => console.error("[fake-browser] error:", err.message));
ws.on("close", () => console.log("[fake-browser] connection closed"));
