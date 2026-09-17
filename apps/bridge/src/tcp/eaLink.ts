import { EventEmitter } from "node:events";
import { createServer, type Server, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import type { BridgeToEaMessage, EaToBridgeMessage } from "@xau-trader/protocol";
import { LineFramer, writeLine } from "./ndjson.js";
import { createLogger } from "../log.js";

const log = createLogger("ea-link");
const REQUEST_TIMEOUT_MS = 5000;

interface PendingRequest {
  resolve: (msg: EaToBridgeMessage) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// Only one MT5 terminal talks to this bridge at a time. A fresh incoming
// connection replaces whatever was there before (EA reconnect after a
// terminal restart, template reload, etc.) rather than being rejected.
export class EaLink extends EventEmitter {
  private server: Server | undefined;
  private socket: Socket | undefined;
  private framer = new LineFramer();
  private pending = new Map<string, PendingRequest>();

  listen(port: number, host: string): void {
    this.server = createServer((socket) => this.handleConnection(socket));
    this.server.listen(port, host, () => {
      log.info(`listening for the EA on ${host}:${port}`);
    });
  }

  isConnected(): boolean {
    return !!this.socket && !this.socket.destroyed;
  }

  private handleConnection(socket: Socket): void {
    if (this.socket && !this.socket.destroyed) {
      log.warn("new EA connection replacing an existing one");
      this.socket.destroy();
    }
    this.socket = socket;
    this.framer = new LineFramer();
    log.info(`EA connected from ${socket.remoteAddress}:${socket.remotePort}`);
    this.emit("connected");

    socket.on("data", (chunk) => {
      for (const line of this.framer.push(chunk.toString("utf8"))) {
        this.handleLine(line);
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
        log.info("EA disconnected");
        this.emit("disconnected");
        this.rejectAllPending(new Error("EA disconnected"));
      }
    });
    socket.on("error", (err) => log.warn("EA socket error", err.message));
  }

  private handleLine(line: string): void {
    let msg: EaToBridgeMessage;
    try {
      msg = JSON.parse(line) as EaToBridgeMessage;
    } catch {
      log.warn("dropped unparseable line from EA", line.slice(0, 200));
      return;
    }

    if (msg.reqId && this.pending.has(msg.reqId)) {
      const p = this.pending.get(msg.reqId)!;
      this.pending.delete(msg.reqId);
      clearTimeout(p.timer);
      p.resolve(msg);
      return;
    }

    this.emit("message", msg);
    this.emit(msg.type, msg);
  }

  // Fire-and-forget push to the EA (no response expected).
  send(msg: BridgeToEaMessage): void {
    if (!this.socket || this.socket.destroyed) {
      log.warn(`dropped ${msg.type} — no EA connected`);
      return;
    }
    writeLine(this.socket, msg);
  }

  // Request/response, correlated by reqId, with a timeout so a stuck EA
  // round-trip (or one that raced a disconnect) never hangs a caller forever.
  request<TRes extends EaToBridgeMessage>(msg: BridgeToEaMessage): Promise<TRes> {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error("no EA connected"));
    }
    const reqId = msg.reqId ?? randomUUID();
    const withId = { ...msg, reqId };

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`EA request ${msg.type} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(reqId, { resolve: resolve as (msg: EaToBridgeMessage) => void, reject, timer });
      writeLine(this.socket!, withId);
    });
  }

  private rejectAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }
}

export const eaLink = new EaLink();
