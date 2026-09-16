//+------------------------------------------------------------------+
//|                                                OrderManager.mqh   |
//|   XAU-Trader — sends and modifies orders/positions for the panel. |
//|   Every public entry point is guarded by a busy-flag so a double  |
//|   click (or a stuck network round-trip) can never fire twice.     |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
#include "../Core/Types.mqh"
#include "../Core/Utils.mqh"
#include "../Money/SymbolInfoCache.mqh"

class COrderManager
  {
private:
   CTrade   m_trade;
   bool     m_busy;
   ulong    m_magic;
   int      m_deviationPoints;

public:
   void Init(const ulong magic, const int deviationPoints, const string comment)
     {
      m_magic = magic;
      m_deviationPoints = deviationPoints;
      m_busy = false;
      m_trade.SetExpertMagicNumber(magic);
      m_trade.SetDeviationInPoints(deviationPoints);
      m_trade.SetTypeFillingBySymbol(_Symbol);
      m_trade.LogLevel(LOG_LEVEL_ERRORS);
     }

   bool IsBusy() const { return m_busy; }

   //--- Sends the order described by plan/lots. Returns false and fills
   //--- outMessage on failure (rejected, requote, no connection, timeout...).
   bool Send(const STradePlan &plan, const double lots, const SSymbolSnapshot &sym, string &outMessage, ulong &outTicket)
     {
      outTicket = 0;
      if(m_busy)
        {
         outMessage = "busy";
         return false;
        }
      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
        {
         outMessage = "trade_context_disabled";
         return false;
        }

      m_busy = true;
      bool ok = false;
      const bool isBuy = (plan.direction == TRADE_DIR_BUY);
      double entry = (plan.placement == PLACEMENT_MARKET) ? (isBuy ? sym.ask : sym.bid) : plan.entryPrice;
      entry = CXautUtils::NormalizePriceToTick(entry, sym.tickSize, sym.digits);
      double sl = plan.slPrice > 0.0 ? CXautUtils::NormalizePriceToTick(plan.slPrice, sym.tickSize, sym.digits) : 0.0;
      double tp = plan.tpPrice > 0.0 ? CXautUtils::NormalizePriceToTick(plan.tpPrice, sym.tickSize, sym.digits) : 0.0;

      if(plan.placement == PLACEMENT_MARKET)
        {
         ok = isBuy ? m_trade.Buy(lots, sym.symbol, 0.0, sl, tp, "XAU-Trader")
                    : m_trade.Sell(lots, sym.symbol, 0.0, sl, tp, "XAU-Trader");
        }
      else if(plan.placement == PLACEMENT_LIMIT)
        {
         ok = isBuy ? m_trade.BuyLimit(lots, entry, sym.symbol, sl, tp, ORDER_TIME_GTC, 0, "XAU-Trader")
                    : m_trade.SellLimit(lots, entry, sym.symbol, sl, tp, ORDER_TIME_GTC, 0, "XAU-Trader");
        }
      else // PLACEMENT_STOP
        {
         ok = isBuy ? m_trade.BuyStop(lots, entry, sym.symbol, sl, tp, ORDER_TIME_GTC, 0, "XAU-Trader")
                    : m_trade.SellStop(lots, entry, sym.symbol, sl, tp, ORDER_TIME_GTC, 0, "XAU-Trader");
        }

      if(ok)
        {
         outTicket = m_trade.ResultDeal() != 0 ? m_trade.ResultDeal() : m_trade.ResultOrder();
         outMessage = "";
        }
      else
        {
         outMessage = IntegerToString(m_trade.ResultRetcode()) + " " + m_trade.ResultRetcodeDescription();
        }

      m_busy = false;
      return ok;
     }

   //--- Re-price an existing pending order (used when the user drags its
   //--- entry/SL/TP lines on the chart). Freeze-level applies here, unlike
   //--- on a brand-new order, because the order already exists on the server.
   bool ModifyPending(const ulong ticket, const double price, const double sl, const double tp,
                       const SSymbolSnapshot &sym, string &outMessage)
     {
      if(m_busy) { outMessage = "busy"; return false; }
      if(!OrderSelect(ticket)) { outMessage = "not_found"; return false; }

      if(sym.freezeLevelPoints > 0)
        {
         double curPrice = OrderGetDouble(ORDER_PRICE_OPEN);
         double refPrice = (sym.bid + sym.ask) / 2.0;
         if(MathAbs(curPrice - refPrice) / sym.point < sym.freezeLevelPoints)
           {
            outMessage = "freeze_level";
            return false;
           }
        }

      m_busy = true;
      double p  = CXautUtils::NormalizePriceToTick(price, sym.tickSize, sym.digits);
      double s  = sl > 0.0 ? CXautUtils::NormalizePriceToTick(sl, sym.tickSize, sym.digits) : 0.0;
      double t  = tp > 0.0 ? CXautUtils::NormalizePriceToTick(tp, sym.tickSize, sym.digits) : 0.0;
      bool ok = m_trade.OrderModify(ticket, p, s, t, ORDER_TIME_GTC, 0);
      outMessage = ok ? "" : (IntegerToString(m_trade.ResultRetcode()) + " " + m_trade.ResultRetcodeDescription());
      m_busy = false;
      return ok;
     }

   //--- Adjusts SL/TP of an already-open position (dragging its lines on chart).
   bool ModifyPosition(const ulong ticket, const double sl, const double tp,
                        const SSymbolSnapshot &sym, string &outMessage)
     {
      if(m_busy) { outMessage = "busy"; return false; }
      if(!PositionSelectByTicket(ticket)) { outMessage = "not_found"; return false; }

      if(sym.freezeLevelPoints > 0)
        {
         double refPrice = (sym.bid + sym.ask) / 2.0;
         if(sl > 0.0 && MathAbs(sl - refPrice) / sym.point < sym.freezeLevelPoints) { outMessage = "freeze_level"; return false; }
         if(tp > 0.0 && MathAbs(tp - refPrice) / sym.point < sym.freezeLevelPoints) { outMessage = "freeze_level"; return false; }
        }

      m_busy = true;
      double s = sl > 0.0 ? CXautUtils::NormalizePriceToTick(sl, sym.tickSize, sym.digits) : 0.0;
      double t = tp > 0.0 ? CXautUtils::NormalizePriceToTick(tp, sym.tickSize, sym.digits) : 0.0;
      bool ok = m_trade.PositionModify(ticket, s, t);
      outMessage = ok ? "" : (IntegerToString(m_trade.ResultRetcode()) + " " + m_trade.ResultRetcodeDescription());
      m_busy = false;
      return ok;
     }

   bool CancelPending(const ulong ticket, string &outMessage)
     {
      if(m_busy) { outMessage = "busy"; return false; }
      m_busy = true;
      bool ok = m_trade.OrderDelete(ticket);
      outMessage = ok ? "" : (IntegerToString(m_trade.ResultRetcode()) + " " + m_trade.ResultRetcodeDescription());
      m_busy = false;
      return ok;
     }
  };
//+------------------------------------------------------------------+
