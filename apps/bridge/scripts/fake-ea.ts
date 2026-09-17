// Standalone dev harness: stands in for the live MT5 terminal so the bridge's
// TCP parsing/relay logic can be exercised without a real MetaTrader install.
// I (the assistant) have no way to drive the live MT5 GUI — this is the
// verification substitute described in the plan's "Verification approach".
//
// Usage: pnpm --filter @xau-trader/bridge exec tsx scripts/fake-ea.ts
import { connect } from "node:net";
import type { BridgeToEaMessage, EaToBridgeMessage } from "@xau-trader/protocol";

const HOST = "127.0.0.1";
const PORT = Number(process.env.EA_TCP_PORT ?? 9443);

const socket = connect(PORT, HOST, () => {
  console.log(`[fake-ea] connected to bridge at ${HOST}:${PORT}`);
  send({ type: "hello", payload: { account: 12345678, broker: "Demo Broker", symbol: "XAUUSD", magic: 574839201, eaVersion: "2.0.0-dev" } });
  send({ type: "symbol", payload: { symbol: "XAUUSD", digits: 2, point: 0.01, volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01, tickSize: 0.01, tickValueProfit: 1, tickValueLoss: 1, stopsLevelPoints: 0, freezeLevelPoints: 0, tradeMode: 4, valid: true } });
  send({ type: "account", payload: { balance: 10000, equity: 10023.5, freeMargin: 9800, currency: "USD" } });
  send({ type: "positions", payload: { positions: [] } });

  let price = 2400.0;
  setInterval(() => {
    price += (Math.random() - 0.5) * 0.5;
    send({ type: "tick", payload: { symbol: "XAUUSD", bid: price, ask: price + 0.3, time: Math.floor(Date.now() / 1000) } });
  }, 500);
});

function send(msg: EaToBridgeMessage): void {
  socket.write(JSON.stringify(msg) + "\n");
}

let buffer = "";
socket.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx: number;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line) as BridgeToEaMessage;
    console.log("[fake-ea] <-", msg.type, msg.payload);
    if (msg.type === "bars.request") {
      const bars = Array.from({ length: msg.payload.count }, (_, i) => {
        const t = Math.floor(Date.now() / 1000) - (msg.payload.count - i) * 60;
        const o = 2400 + i * 0.1;
        return { time: t, open: o, high: o + 0.5, low: o - 0.5, close: o + 0.2, volume: 10 };
      });
      send({ type: "bars.data", reqId: msg.reqId, payload: { symbol: msg.payload.symbol, timeframe: msg.payload.timeframe, bars } });
    }
  }
});

socket.on("error", (err) => console.error("[fake-ea] error:", err.message));
socket.on("close", () => console.log("[fake-ea] connection closed"));
