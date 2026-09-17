import { createServer, type Server } from "node:http";
import { liveState } from "../state/liveState.js";

// Phase A/B/C dev: the Next.js app (apps/web) runs its own `next dev` server
// and talks to this bridge's WebSocket over a full URL. This HTTP server
// only needs to host /ws and a lightweight status endpoint during that
// period. Phase D wires the built Next.js standalone output in here so the
// packaged app is a single process on a single port — see the plan's
// packaging section before touching this file for that.
export function createHttpServer(): Server {
  return createServer((req, res) => {
    if (req.url === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, eaConnected: liveState.eaConnected }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end(
      "XAU-Trader bridge is running.\n" +
        "During development the web client runs separately (pnpm dev:web) — " +
        "this process only serves /ws and /status until Phase D packaging.",
    );
  });
}
