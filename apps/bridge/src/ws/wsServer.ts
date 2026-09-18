import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  BridgeToBrowserMessage,
  BrowserToBridgeMessage,
  ClosedDeal,
  EaBarsData,
  EaOrderAck,
  EaRiskResult,
} from "@xau-trader/protocol";
import { eaLink } from "../tcp/eaLink.js";
import { liveState } from "../state/liveState.js";
import { journalEvents } from "../state/journalSync.js";
import { addComment, deleteComment, editComment, listComments, listDeals } from "../db/journal.js";
import { getSettings, updateSettings } from "../db/settings.js";
import { checkForUpdate } from "../updateCheck.js";
import { applyUpdate } from "../selfUpdate.js";
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
    send(ws, { type: "settings.data", payload: getSettings() });

    ws.on("message", (raw) => void handleBrowserMessage(ws, raw.toString("utf8")));
    ws.on("close", () => {
      clients.delete(ws);
      log.info(`browser disconnected (${clients.size} total)`);
    });
    ws.on("error", (err) => log.warn("browser ws error", err.message));
  });

  // Relay every live EA push straight through to all connected browser tabs.
  eaLink.on("connected", () => broadcast(clients, { type: "ea.status", payload: { connected: true } }));
  // A fresh EA connection (terminal restart, template reload, bridge
  // restart...) always comes up on its chart's own native symbol (see
  // XAU_Trader.mq5's g_activeSymbol init) — re-apply whatever the user last
  // explicitly selected so a mid-weekend-test BTCUSD/ETHUSD selection
  // survives a reconnect instead of silently snapping back to XAUUSD.
  eaLink.on("connected", () => {
    const { activeSymbol } = getSettings();
    if (activeSymbol) eaLink.send({ type: "symbol.select", payload: { symbol: activeSymbol } });
  });
  eaLink.on("disconnected", () => broadcast(clients, { type: "ea.status", payload: { connected: false } }));
  eaLink.on("tick", (msg) => broadcast(clients, msg));
  eaLink.on("positions", (msg) => broadcast(clients, msg));
  eaLink.on("account", (msg) => broadcast(clients, msg));
  eaLink.on("symbol", (msg) => broadcast(clients, msg));
  eaLink.on("bar.update", (msg) => broadcast(clients, msg));
  // Async, unprompted failures (e.g. a coalesced position-modify that the
  // broker ultimately rejected) — not correlated to any one browser request.
  eaLink.on("error", (msg) => broadcast(clients, msg));
  // A deal just got journaled (live push or backfill) — tell every tab so an
  // open Journal view updates without a manual refresh.
  journalEvents.on("deal", (deal: ClosedDeal) => broadcast(clients, { type: "journal.update", payload: { deals: [deal] } }));

  async function handleBrowserMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: BrowserToBridgeMessage;
    try {
      msg = JSON.parse(raw) as BrowserToBridgeMessage;
    } catch {
      log.warn("dropped unparseable line from browser", raw.slice(0, 200));
      return;
    }

    switch (msg.type) {
      case "ping": {
        send(ws, { type: "pong", reqId: msg.reqId, payload: {} });
        return;
      }
      case "bars.request": {
        try {
          const res = await eaLink.request<EaBarsData>({ type: "bars.request", payload: msg.payload });
          send(ws, { type: "bars.data", reqId: msg.reqId, payload: res.payload });
        } catch (err) {
          send(ws, { type: "error", reqId: msg.reqId, payload: { message: (err as Error).message } });
        }
        return;
      }
      case "symbol.select": {
        // Persist first (so a reconnect resync above sees it too), then
        // broadcast the new settings — including to the tab that made the
        // change, same pattern as settings.update — and forward to the EA.
        // No ack: the next symbol/tick/positions push confirms it.
        const settings = updateSettings({ activeSymbol: msg.payload.symbol });
        broadcast(clients, { type: "settings.data", payload: settings });
        eaLink.send({ type: "symbol.select", payload: msg.payload });
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
      case "order.closePartial":
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
      case "journal.request": {
        const deals = listDeals(msg.payload);
        send(ws, { type: "journal.data", reqId: msg.reqId, payload: { deals } });
        return;
      }
      case "journal.comments.request": {
        const comments = listComments(msg.payload.dealTicket);
        send(ws, { type: "journal.comments", reqId: msg.reqId, payload: { dealTicket: msg.payload.dealTicket, comments } });
        return;
      }
      case "journal.comment.add": {
        addComment(msg.payload.dealTicket, msg.payload.body);
        const comments = listComments(msg.payload.dealTicket);
        send(ws, { type: "journal.comments", reqId: msg.reqId, payload: { dealTicket: msg.payload.dealTicket, comments } });
        return;
      }
      case "journal.comment.edit": {
        editComment(msg.payload.id, msg.payload.body);
        return;
      }
      case "journal.comment.delete": {
        deleteComment(msg.payload.id);
        return;
      }
      case "settings.request": {
        send(ws, { type: "settings.data", reqId: msg.reqId, payload: getSettings() });
        return;
      }
      case "settings.update": {
        const settings = updateSettings(msg.payload);
        // Broadcast, not just reply — a second open tab should reflect a
        // theme/default change too, not just the tab that made it.
        broadcast(clients, { type: "settings.data", payload: settings });
        return;
      }
      case "update.check": {
        try {
          const result = await checkForUpdate();
          send(ws, { type: "update.result", reqId: msg.reqId, payload: result });
        } catch (err) {
          send(ws, { type: "error", reqId: msg.reqId, payload: { message: (err as Error).message } });
        }
        return;
      }
      case "update.apply": {
        // Fire-and-forget — see BrowserUpdateApply's doc comment. Progress
        // goes out as broadcasts so every connected tab sees it, not just
        // the one that clicked the button; applyUpdate() itself exits the
        // process partway through, so there's no final response to send.
        applyUpdate((stage, message) => broadcast(clients, { type: "update.progress", payload: { stage, message } })).catch(
          (err: Error) => broadcast(clients, { type: "update.progress", payload: { stage: "error", message: err.message } }),
        );
        return;
      }
      default: {
        // Every known BrowserToBridgeMessage variant is handled above, so
        // TS narrows msg to `never` here — this only fires for malformed or
        // future/unknown input the `as` cast above couldn't actually verify.
        const unknownMsg = msg as { type?: string; reqId?: string };
        send(ws, { type: "error", reqId: unknownMsg.reqId, payload: { message: `not implemented yet: ${unknownMsg.type}` } });
      }
    }
  }
}
