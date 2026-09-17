import "dotenv/config";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  eaTcpPort: envInt("EA_TCP_PORT", 9443),
  httpPort: envInt("HTTP_PORT", 8787),
  // The packaged build spawns the Next.js standalone server as a sibling
  // process on its own port (see webServerLauncher.ts) rather than hosting
  // it in-process — packaging Next.js itself through pkg proved fragile
  // (dynamic route requires, native @next/swc binaries), while a portable
  // Node runtime running the real standalone server.js verified cleanly
  // under Wine. The EA's InpWebPort input must match this for the "open in
  // browser" step to point at the right port.
  webPort: envInt("WEB_PORT", 8788),
  dbPath: process.env.DB_PATH ?? "./data/xautrader.db",
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  // The EA-facing socket is hard-bound to loopback regardless of env config —
  // this is a trust-everything trading protocol, never expose it beyond the
  // local machine.
  eaBindHost: "127.0.0.1",
} as const;
