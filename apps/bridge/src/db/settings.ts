import type { Settings } from "@xau-trader/protocol";
import { getDb } from "./migrate.js";

// The direct successor to XAU_Trader.mq5's old SettingsStore.mqh ini file —
// same idea (persist a handful of user preferences across restarts), new
// storage (SQLite key=value here instead of a flat file in MQL5/Files).
const DEFAULTS: Settings = {
  theme: "dark",
  lang: "en",
  riskMode: "percent_balance",
  riskValue: 1,
  placement: "market",
  rrRatio: 2,
  chartTimeframe: "M1",
};

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  return { ...DEFAULTS, ...stored } as Settings;
}

export function updateSettings(partial: Partial<Settings>): Settings {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  // A handful of key=value writes on an infrequent, user-triggered path —
  // not worth wrapping in an explicit BEGIN/COMMIT (node:sqlite's
  // DatabaseSync has no better-sqlite3-style `.transaction()` helper).
  for (const [key, value] of Object.entries(partial)) stmt.run(key, JSON.stringify(value));
  return getSettings();
}
