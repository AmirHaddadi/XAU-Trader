import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { createLogger } from "../log.js";

const log = createLogger("db");

// Uses Node's built-in node:sqlite (stable enough here, and available
// without qualification since Node 22.5 — this dev machine and the
// packaged build both pin an exact Node version, so "experimental API"
// carries none of the usual future-Node-upgrade risk) rather than
// better-sqlite3. The plan called out better-sqlite3's native addon as the
// one real risk in Phase D's pkg packaging step, with sql.js (WASM) as the
// fallback if it proved fragile; node:sqlite removes that risk entirely —
// nothing to bundle/rebuild, it ships with the Node runtime itself — which
// only became clear once Phase D's own packaging smoke test surfaced it,
// so this is a deviation from the original plan text, not an oversight.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS journal_entries (
  deal_ticket     INTEGER PRIMARY KEY,
  position_ticket INTEGER NOT NULL,
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  volume          REAL NOT NULL,
  price_open      REAL NOT NULL,
  price_close     REAL NOT NULL,
  sl              REAL NOT NULL,
  tp              REAL NOT NULL,
  profit          REAL NOT NULL,
  swap            REAL NOT NULL,
  commission      REAL NOT NULL,
  magic           INTEGER NOT NULL,
  time_open       INTEGER NOT NULL,
  time_close      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_ticket INTEGER NOT NULL REFERENCES journal_entries(deal_ticket) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_comments_deal ON journal_comments(deal_ticket);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  log.info(`schema ready at ${config.dbPath}`);
  return db;
}
