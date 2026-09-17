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
  dbPath: process.env.DB_PATH ?? "./data/xautrader.db",
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  // The EA-facing socket is hard-bound to loopback regardless of env config —
  // this is a trust-everything trading protocol, never expose it beyond the
  // local machine.
  eaBindHost: "127.0.0.1",
} as const;
