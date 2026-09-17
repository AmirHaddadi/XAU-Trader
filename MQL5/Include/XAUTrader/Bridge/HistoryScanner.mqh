//+------------------------------------------------------------------+
//|                                               HistoryScanner.mqh  |
//|   XAU-Trader — turns closed deals into journal-ready records for  |
//|   the bridge. Journal-only concern: nothing here feeds back into  |
//|   the trading engine (RiskEngine/OrderManager/PositionTracker),   |
//|   so it lives in Bridge/, not Core/ or Trading/.                  |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"

//--- One closed leg of a position, ready to become a journal row.
//--- Mirrors packages/protocol/src/domain.ts's ClosedDeal one-to-one.
struct SClosedDeal
  {
   ulong          dealTicket;      // the closing (OUT/OUT_BY) deal's own ticket — journal primary key
   ulong          positionTicket;  // DEAL_POSITION_ID — groups partial closes of the same position
   string         symbol;
   ENUM_TRADE_DIR direction;
   double         volume;
   double         priceOpen;
   double         priceClose;
   double         sl;              // always 0 — MT5 does not retain a closed position's SL/TP
   double         tp;              // always 0 — see above
   double         profit;
   double         swap;
   double         commission;
   long           magic;
   datetime       timeOpen;
   datetime       timeClose;
  };

class CHistoryScanner
  {
private:
   //--- Highest closing-deal ticket already pushed this session. Deal
   //--- tickets are assigned sequentially by the server, so tracking just
   //--- the max is enough to dedupe — reset on EA restart; the bridge's own
   //--- history.request{sinceTicket} backfill (against its durable SQLite
   //--- store) is what covers catching up after that, not this field.
   ulong m_lastDealTicket;

public:
   CHistoryScanner() { m_lastDealTicket = 0; }

   //--- Call periodically (e.g. every 1000ms, same cadence as the position
   //--- scan) — returns newly-closed deals since the last call, oldest
   //--- first, and advances the dedupe cursor.
   int ScanNew(const string symbol, SClosedDeal &out[])
     {
      return ScanSince(symbol, m_lastDealTicket, out, true);
     }

   //--- Answers a bridge history.request{sinceTicket} backfill. Does not
   //--- touch the live dedupe cursor above — a backfill and the ongoing
   //--- live scan are independent concerns that just happen to share logic.
   int ScanSinceTicket(const string symbol, const ulong sinceTicket, SClosedDeal &out[])
     {
      return ScanSince(symbol, sinceTicket, out, false);
     }

private:
   int ScanSince(const string symbol, const ulong sinceTicket, SClosedDeal &out[], const bool advanceCursor)
     {
      ArrayResize(out, 0);
      if(!HistorySelect(0, TimeCurrent()))
         return 0;

      // Phase 1: find qualifying closing deals under the *global* history
      // selection. HistorySelectByPosition() (phase 2, below) replaces that
      // selection wholesale, so it must never run interleaved with this loop.
      ulong outTickets[];
      ulong maxTicket = sinceTicket;
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0 || ticket <= sinceTicket)
            continue;
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != symbol)
            continue;
         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
            continue;
         ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
         if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
            continue; // excludes balance/credit/correction synthetic "deals"

         int n = ArraySize(outTickets);
         ArrayResize(outTickets, n + 1);
         outTickets[n] = ticket;
         if(ticket > maxTicket)
            maxTicket = ticket;
        }

      // Phase 2: build each record (HistorySelectByPosition per deal).
      int count = 0;
      for(int i = 0; i < ArraySize(outTickets); i++)
        {
         SClosedDeal deal;
         if(BuildClosedDeal(outTickets[i], deal))
           {
            ArrayResize(out, count + 1);
            out[count] = deal;
            count++;
           }
        }

      if(advanceCursor && maxTicket > m_lastDealTicket)
         m_lastDealTicket = maxTicket;

      return count;
     }

   //--- Re-selects history scoped to the closing deal's position to find
   //--- its opening fill. Commission is broker-dependent (charged entirely
   //--- on entry, entirely on exit, or split) — summing the entry fill's
   //--- own commission with this exit deal's own commission covers the
   //--- common single-in/single-out case correctly. A position closed via
   //--- multiple partial exits will show the entry commission repeated on
   //--- each partial row; profit/price/volume per row stay accurate either
   //--- way, and partial closes aren't a feature this app's own UI exposes.
   bool BuildClosedDeal(const ulong outTicket, SClosedDeal &deal)
     {
      ulong posId = (ulong)HistoryDealGetInteger(outTicket, DEAL_POSITION_ID);
      if(!HistorySelectByPosition(posId))
         return false;

      ulong inTicket = 0;
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0)
            continue;
         ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
         if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
            continue;
         if(inTicket == 0 && (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY) == DEAL_ENTRY_IN)
            inTicket = ticket; // first fill of this position
        }
      if(inTicket == 0)
         return false; // malformed/partial history (e.g. truncated by broker retention) — skip, don't push a half-built row

      ENUM_DEAL_TYPE inType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(inTicket, DEAL_TYPE);

      deal.dealTicket     = outTicket;
      deal.positionTicket = posId;
      deal.symbol         = HistoryDealGetString(inTicket, DEAL_SYMBOL);
      deal.direction      = (inType == DEAL_TYPE_BUY) ? TRADE_DIR_BUY : TRADE_DIR_SELL;
      deal.priceOpen      = HistoryDealGetDouble(inTicket, DEAL_PRICE);
      deal.timeOpen        = (datetime)HistoryDealGetInteger(inTicket, DEAL_TIME);
      deal.magic          = HistoryDealGetInteger(inTicket, DEAL_MAGIC);
      deal.priceClose     = HistoryDealGetDouble(outTicket, DEAL_PRICE);
      deal.timeClose       = (datetime)HistoryDealGetInteger(outTicket, DEAL_TIME);
      deal.volume         = HistoryDealGetDouble(outTicket, DEAL_VOLUME);
      deal.profit         = HistoryDealGetDouble(outTicket, DEAL_PROFIT);
      deal.commission     = HistoryDealGetDouble(inTicket, DEAL_COMMISSION) + HistoryDealGetDouble(outTicket, DEAL_COMMISSION);
      deal.swap           = HistoryDealGetDouble(outTicket, DEAL_SWAP);
      deal.sl             = 0.0;
      deal.tp             = 0.0;
      return true;
     }
  };
//+------------------------------------------------------------------+
