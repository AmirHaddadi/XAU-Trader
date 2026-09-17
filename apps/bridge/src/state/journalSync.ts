import { EventEmitter } from "node:events";
import type { ClosedDeal, EaHistoryData } from "@xau-trader/protocol";
import { eaLink } from "../tcp/eaLink.js";
import { getLastKnownDealTicket, upsertDeal } from "../db/journal.js";
import { createLogger } from "../log.js";

const log = createLogger("journal-sync");

// Emits "deal" for each newly-journaled ClosedDeal (live push or backfill),
// so the WS layer can broadcast it without journalSync needing to know
// anything about connected browser clients.
export const journalEvents = new EventEmitter();

function journal(deal: ClosedDeal): void {
  upsertDeal(deal); // idempotent — safe whether this came from the live push or a backfill replay
  journalEvents.emit("deal", deal);
}

eaLink.on("history.newDeals", (msg: { payload: { deals: ClosedDeal[] } }) => {
  for (const deal of msg.payload.deals) journal(deal);
  if (msg.payload.deals.length > 0) log.info(`journaled ${msg.payload.deals.length} new deal(s)`);
});

// A bridge cold-start (or an EA reconnect after being down) can miss deals
// that closed in the gap — ask the EA to replay anything since our own
// last-known ticket the moment it (re)connects.
eaLink.on("connected", () => void backfill());

async function backfill(): Promise<void> {
  const sinceTicket = getLastKnownDealTicket();
  try {
    const res = await eaLink.request<EaHistoryData>({ type: "history.request", payload: { sinceTicket } });
    for (const deal of res.payload.deals) journal(deal);
    if (res.payload.deals.length > 0) log.info(`backfilled ${res.payload.deals.length} deal(s) since ticket ${sinceTicket}`);
  } catch (err) {
    log.warn("history backfill failed", (err as Error).message);
  }
}
