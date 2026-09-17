import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  EaBarsData,
  EaOrderAck,
  EaRiskResult,
} from "@xau-trader/protocol";
import { eaLink } from "../tcp/eaLink.js";
import { liveState } from "../state/liveState.js";
import { createLogger } from "../log.js";

const log = createLogger("ws");

function send(ws: WebSocket, msg: BridgeToBrowserMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(clients: Set<WebSocket>, msg: BridgeToBrowserMessage): void {
  for (const ws of clients) send(ws, msg);
}

export function startWsServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    log.info(`browser connected (${clients.size} total)`);

    // Prime the new tab with whatever we already know, rather than making it
    // wait for the next EA push cycle.
    send(ws, { type: "ea.status", payload: { connected: liveState.eaConnected } });
    if (liveState.symbol) send(ws, { type: "symbol", payload: liveState.symbol });
    if (liveState.account) send(ws, { type: "account", payload: liveState.account });
    if (liveState.tick) send(ws, { type: "tick", payload: liveState.tick });
    send(ws, { type: "positions", payload: { positions: liveState.positions } });

    ws.on("message", (raw) => void handleBrowserMessage(ws, raw.toString("utf8")));
    ws.on("close", () => {
      clients.delete(ws);
      log.info(`browser disconnected (${clients.size} total)`);
    });
    ws.on("error", (err) => log.warn("browser ws error", err.message));
  });

  // Relay every live EA push straight through to all connected browser tabs.
  eaLink.on("connected", () => broadcast(clients, { type: "ea.status", payload: { connected: true } }));
  eaLink.on("disconnected", () => broadcast(clients, { type: "ea.status", payload: { connected: false } }));
  eaLink.on("tick", (msg) => broadcast(clients, msg));
  eaLink.on("positions", (msg) => broadcast(clients, msg));
  eaLink.on("account", (msg) => broadcast(clients, msg));
  eaLink.on("symbol", (msg) => broadcast(clients, msg));
  eaLink.on("bar.update", (msg) => broadcast(clients, msg));
  // Async, unprompted failures (e.g. a coalesced position-modify that the
  // broker ultimately rejected) — not correlated to any one browser request.
  eaLink.on("error", (msg) => broadcast(clients, msg));

  async function handleBrowserMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: BrowserToBridgeMessage;
    try {
      msg = JSON.parse(raw) as BrowserToBridgeMessage;
    } catch {
      log.warn("dropped unparseable line from browser", raw.slice(0, 200));
      return;
    }

    switch (msg.type) {
      case "bars.request": {
        try {
          const res = await eaLink.request<EaBarsData>({ type: "bars.request", payload: msg.payload });
          send(ws, { type: "bars.data", reqId: msg.reqId, payload: res.payload });
        } catch (err) {
          send(ws, { type: "error", reqId: msg.reqId, payload: { message: (err as Error).message } });
        }
        return;
      }
      case "risk.preview": {
        try {
          const res = await eaLink.request<EaRiskResult>({ type: "risk.preview", payload: msg.payload });
          send(ws, { type: "risk.result", reqId: msg.reqId, payload: res.payload });
        } catch (err) {
          send(ws, { type: "error", reqId: msg.reqId, payload: { message: (err as Error).message } });
        }
        return;
      }
      case "order.send":
      case "order.modifyPending":
      case "order.close":
      case "order.cancel": {
        try {
          const res = await eaLink.request<EaOrderAck>({ type: msg.type, payload: msg.payload } as never);
          send(ws, { type: "order.ack", reqId: msg.reqId, payload: res.payload });
        } catch (err) {
          send(ws, { type: "error", reqId: msg.reqId, payload: { message: (err as Error).message } });
        }
        return;
      }
      case "order.modifyPosition": {
        // High-frequency drag stream — fire-and-forget, coalesced EA-side
        // (see CBridgeHandlers). The browser sees the confirmed sl/tp via
        // the next `positions` push, not a per-message ack.
        eaLink.send({ type: "order.modifyPosition", payload: msg.payload });
        return;
      }
      default:
        // Journal and settings land in Phase C — a stray/future message
        // shouldn't crash the connection either way.
        send(ws, { type: "error", reqId: msg.reqId, payload: { message: `not implemented yet: ${msg.type}` } });
    }
  }
}
