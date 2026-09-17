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
    if (msg.type === "risk.preview") {
      send({ type: "risk.result", reqId: msg.reqId, payload: fakeRisk(msg.payload.plan) });
    }
    if (msg.type === "order.send") {
      const risk = fakeRisk(msg.payload.plan);
      if (risk.code !== "ok") {
        send({ type: "order.ack", reqId: msg.reqId, payload: { ok: false, message: risk.code } });
      } else {
        send({ type: "order.ack", reqId: msg.reqId, payload: { ok: true, message: "", ticket: 900001 } });
      }
    }
    if (msg.type === "order.modifyPending" || msg.type === "order.close" || msg.type === "order.cancel") {
      send({ type: "order.ack", reqId: msg.reqId, payload: { ok: true, message: "" } });
    }
    if (msg.type === "order.modifyPosition") {
      console.log(`[fake-ea] (coalesced, no ack expected) ticket=${msg.payload.ticket} sl=${msg.payload.sl} tp=${msg.payload.tp}`);
    }
    if (msg.type === "history.request") {
      const deals = msg.payload.sinceTicket < 500001 ? [fakeDeal(500001)] : [];
      send({ type: "history.data", reqId: msg.reqId, payload: { deals } });
    }
  }
});

function fakeDeal(dealTicket: number) {
  const now = Math.floor(Date.now() / 1000);
  return {
    dealTicket,
    positionTicket: 900001,
    symbol: "XAUUSD",
    direction: "buy" as const,
    volume: 0.2,
    priceOpen: 2400,
    priceClose: 2410,
    sl: 0,
    tp: 0,
    profit: 200,
    swap: -0.5,
    commission: -1.2,
    magic: 574839201,
    timeOpen: now - 3600,
    timeClose: now,
  };
}

// Fires once, a few seconds in, so the "live push" path (as opposed to the
// history.request backfill path) gets exercised too.
setTimeout(() => send({ type: "history.newDeals", payload: { deals: [fakeDeal(500002)] } }), 2000);

// A deliberately simplified stand-in for CRiskEngine::Evaluate — enough to
// exercise the wire protocol's shape, not a reimplementation of the real
// broker-valid lot math (that correctness is verified by the MQL5 compile,
// not this harness).
function fakeRisk(plan: { riskMode: string; riskValue: number; slPrice: number; tpPrice: number; entryPrice: number }) {
  if (plan.slPrice <= 0) return { code: "err_sl_missing", lots: 0, rawLots: 0, riskMoney: 0, rewardMoney: 0, rr: 0, marginRequired: 0, message: "" };
  const entry = plan.entryPrice > 0 ? plan.entryPrice : 2400;
  const riskMoney = plan.riskMode === "fixed_money" ? plan.riskValue : 10000 * (plan.riskValue / 100);
  const slDist = Math.abs(entry - plan.slPrice);
  const lots = Math.max(0.01, Math.round((riskMoney / (slDist * 100)) * 100) / 100);
  const tpDist = plan.tpPrice > 0 ? Math.abs(entry - plan.tpPrice) : 0;
  const rewardMoney = tpDist * 100 * lots;
  return { code: "ok", lots, rawLots: lots, riskMoney, rewardMoney, rr: tpDist > 0 ? rewardMoney / riskMoney : 0, marginRequired: 50, message: "" };
}

socket.on("error", (err) => console.error("[fake-ea] error:", err.message));
socket.on("close", () => console.log("[fake-ea] connection closed"));
