import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { createLogger } from "../log.js";

const log = createLogger("db");

// Phase A scope: create the schema so later phases (journal UI in Phase C,
// settings tab in Phase C) have a stable table shape to build against. No
// CRUD is wired to the WS layer yet — see packages/protocol's journal.* /
// settings.* message types for the contract this will eventually serve.
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

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  log.info(`schema ready at ${config.dbPath}`);
  return db;
}
