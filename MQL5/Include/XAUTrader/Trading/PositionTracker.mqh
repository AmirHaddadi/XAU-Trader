//+------------------------------------------------------------------+
//|                                             PositionTracker.mqh   |
//|   XAU-Trader — reads the terminal's live position list for the    |
//|   current symbol. Deliberately stateless: every call re-scans     |
//|   PositionsTotal()/PositionGetTicket() rather than trusting any    |
//|   cached/remembered ticket, so a timeframe switch, EA reinit,      |
//|   terminal restart or a position opened by hand/another EA is      |
//|   always picked back up correctly — there is nothing to lose.      |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Types.mqh"

class CPositionTracker
  {
public:
   //--- Every open position on `symbol`, regardless of magic number or who
   //--- opened it — the panel is a management surface for the symbol, not
   //--- just for tickets this EA itself sent. Netting accounts will only
   //--- ever have one; hedging accounts can have several.
   static int ScanSymbol(const string symbol, SPositionInfo &out[])
     {
      int total = PositionsTotal();
      ArrayResize(out, total);
      int count = 0;
      for(int i = 0; i < total; i++)
        {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0)
            continue;
         if(!PositionSelectByTicket(ticket))
            continue;
         if(PositionGetString(POSITION_SYMBOL) != symbol)
            continue;

         out[count].ticket    = ticket;
         out[count].type      = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         out[count].volume    = PositionGetDouble(POSITION_VOLUME);
         out[count].priceOpen = PositionGetDouble(POSITION_PRICE_OPEN);
         out[count].sl        = PositionGetDouble(POSITION_SL);
         out[count].tp        = PositionGetDouble(POSITION_TP);
         out[count].profit    = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
         out[count].magic     = PositionGetInteger(POSITION_MAGIC);
         out[count].timeOpen  = (datetime)PositionGetInteger(POSITION_TIME);
         count++;
        }
      ArrayResize(out, count);
      return count;
     }

   //--- Every not-yet-filled pending order on `symbol` — MT5's separate
   //--- OrdersTotal()/OrderGetTicket() API, since a pending order has no
   //--- position yet. Only the four types this EA itself ever places
   //--- (OrderManager::Send's BuyLimit/SellLimit/BuyStop/SellStop) are
   //--- recognized; anything else (e.g. a stop-limit placed by hand or
   //--- another EA) is skipped rather than mis-labeled — same "don't guess"
   //--- posture as PositionTypeToString's own narrow mapping.
   static int ScanPendingSymbol(const string symbol, SPendingOrderInfo &out[])
     {
      int total = OrdersTotal();
      ArrayResize(out, total);
      int count = 0;
      for(int i = 0; i < total; i++)
        {
         ulong ticket = OrderGetTicket(i);
         if(ticket == 0)
            continue;
         if(!OrderSelect(ticket))
            continue;
         if(OrderGetString(ORDER_SYMBOL) != symbol)
            continue;
         ENUM_ORDER_TYPE type = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
         if(type != ORDER_TYPE_BUY_LIMIT && type != ORDER_TYPE_SELL_LIMIT &&
            type != ORDER_TYPE_BUY_STOP && type != ORDER_TYPE_SELL_STOP)
            continue;

         out[count].ticket     = ticket;
         out[count].type       = type;
         out[count].volume     = OrderGetDouble(ORDER_VOLUME_CURRENT);
         out[count].priceOpen  = OrderGetDouble(ORDER_PRICE_OPEN);
         out[count].sl         = OrderGetDouble(ORDER_SL);
         out[count].tp         = OrderGetDouble(ORDER_TP);
         out[count].magic      = OrderGetInteger(ORDER_MAGIC);
         out[count].timePlaced = (datetime)OrderGetInteger(ORDER_TIME_SETUP);
         count++;
        }
      ArrayResize(out, count);
      return count;
     }
  };
//+------------------------------------------------------------------+
