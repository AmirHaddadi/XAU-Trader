import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  EaBarsData,
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
      default:
        // Order actions, risk preview, journal, and settings land in Phases
        // B/C — the Phase A web client never sends them, but a stray/future
        // message shouldn't crash the connection.
        send(ws, { type: "error", reqId: msg.reqId, payload: { message: `not implemented yet: ${msg.type}` } });
    }
  }
}
