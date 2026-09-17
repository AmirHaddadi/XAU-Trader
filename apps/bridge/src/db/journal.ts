import type { ClosedDeal, JournalComment } from "@xau-trader/protocol";
import { getDb } from "./migrate.js";

interface JournalRow {
  deal_ticket: number;
  position_ticket: number;
  symbol: string;
  direction: "buy" | "sell";
  volume: number;
  price_open: number;
  price_close: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  magic: number;
  time_open: number;
  time_close: number;
}

function rowToDeal(row: JournalRow): ClosedDeal {
  return {
    dealTicket: row.deal_ticket,
    positionTicket: row.position_ticket,
    symbol: row.symbol,
    direction: row.direction,
    volume: row.volume,
    priceOpen: row.price_open,
    priceClose: row.price_close,
    sl: row.sl,
    tp: row.tp,
    profit: row.profit,
    swap: row.swap,
    commission: row.commission,
    magic: row.magic,
    timeOpen: row.time_open,
    timeClose: row.time_close,
  };
}

// Idempotent by design — the EA's live push and the bridge's own
// reconnect-backfill (history.request{sinceTicket}) can both deliver the
// same deal_ticket more than once; INSERT OR REPLACE makes that safe.
export function upsertDeal(deal: ClosedDeal): void {
  getDb()
    .prepare(
      `INSERT INTO journal_entries
        (deal_ticket, position_ticket, symbol, direction, volume, price_open, price_close, sl, tp, profit, swap, commission, magic, time_open, time_close)
       VALUES (@dealTicket, @positionTicket, @symbol, @direction, @volume, @priceOpen, @priceClose, @sl, @tp, @profit, @swap, @commission, @magic, @timeOpen, @timeClose)
       ON CONFLICT(deal_ticket) DO UPDATE SET
        position_ticket=excluded.position_ticket, symbol=excluded.symbol, direction=excluded.direction,
        volume=excluded.volume, price_open=excluded.price_open, price_close=excluded.price_close,
        sl=excluded.sl, tp=excluded.tp, profit=excluded.profit, swap=excluded.swap,
        commission=excluded.commission, magic=excluded.magic, time_open=excluded.time_open, time_close=excluded.time_close`,
    )
    .run(deal);
}

export interface JournalFilter {
  search?: string;
  from?: number;
  to?: number;
}

export function listDeals(filter: JournalFilter = {}): ClosedDeal[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.from !== undefined) {
    clauses.push("time_close >= @from");
    params.from = filter.from;
  }
  if (filter.to !== undefined) {
    clauses.push("time_close <= @to");
    params.to = filter.to;
  }
  if (filter.search) {
    clauses.push(
      "(symbol LIKE @search OR CAST(deal_ticket AS TEXT) LIKE @search OR EXISTS (SELECT 1 FROM journal_comments c WHERE c.deal_ticket = journal_entries.deal_ticket AND c.body LIKE @search))",
    );
    params.search = `%${filter.search}%`;
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM journal_entries ${where} ORDER BY time_close DESC`)
    .all(params) as JournalRow[];
  return rows.map(rowToDeal);
}

export function getLastKnownDealTicket(): number {
  const row = getDb().prepare("SELECT MAX(deal_ticket) AS maxTicket FROM journal_entries").get() as {
    maxTicket: number | null;
  };
  return row.maxTicket ?? 0;
}

interface CommentRow {
  id: number;
  deal_ticket: number;
  body: string;
  created_at: number;
}

function rowToComment(row: CommentRow): JournalComment {
  return { id: row.id, dealTicket: row.deal_ticket, body: row.body, createdAt: row.created_at };
}

export function listComments(dealTicket: number): JournalComment[] {
  const rows = getDb()
    .prepare("SELECT * FROM journal_comments WHERE deal_ticket = ? ORDER BY created_at ASC")
    .all(dealTicket) as CommentRow[];
  return rows.map(rowToComment);
}

export function addComment(dealTicket: number, body: string): JournalComment {
  const createdAt = Date.now();
  const result = getDb()
    .prepare("INSERT INTO journal_comments (deal_ticket, body, created_at) VALUES (?, ?, ?)")
    .run(dealTicket, body, createdAt);
  return { id: Number(result.lastInsertRowid), dealTicket, body, createdAt };
}

export function editComment(id: number, body: string): void {
  getDb().prepare("UPDATE journal_comments SET body = ? WHERE id = ?").run(body, id);
}

export function deleteComment(id: number): void {
  getDb().prepare("DELETE FROM journal_comments WHERE id = ?").run(id);
}
