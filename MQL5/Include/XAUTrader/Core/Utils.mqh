//+------------------------------------------------------------------+
//|                                                        Utils.mqh  |
//|         XAU-Trader — small stateless helpers shared by modules.   |
//+------------------------------------------------------------------+
#property strict
#include "Defines.mqh"

class CXautUtils
  {
public:
   //--- Maps a panel placement+direction pair to the concrete MQL5 order type
   static ENUM_ORDER_TYPE MapOrderType(const ENUM_PLACEMENT_TYPE placement, const ENUM_TRADE_DIR dir)
     {
      const bool isBuy = (dir == TRADE_DIR_BUY);
      switch(placement)
        {
         case PLACEMENT_LIMIT: return isBuy ? ORDER_TYPE_BUY_LIMIT : ORDER_TYPE_SELL_LIMIT;
         case PLACEMENT_STOP:  return isBuy ? ORDER_TYPE_BUY_STOP  : ORDER_TYPE_SELL_STOP;
         default:               return isBuy ? ORDER_TYPE_BUY       : ORDER_TYPE_SELL;
        }
     }

   //--- Rounds a raw lot size down to the broker's volume step grid
   //--- (down, never up — rounding up would silently exceed the user's configured risk)
   static double FloorVolumeToStep(const double rawVolume, const double step, const double volMin)
     {
      if(step <= 0.0)
         return rawVolume;
      double steps = MathFloor((rawVolume + 1e-8) / step);
      double v = steps * step;
      return NormalizeVolume(v, step);
     }

   static double NormalizeVolume(const double v, const double step)
     {
      int stepDigits = 2;
      if(step >= 1.0) stepDigits = 0;
      else if(step >= 0.1) stepDigits = 1;
      else if(step >= 0.01) stepDigits = 2;
      else stepDigits = 3;
      return NormalizeDouble(v, stepDigits);
     }

   static double NormalizePriceToTick(const double price, const double tickSize, const int digits)
     {
      if(tickSize > 0.0)
        {
         double steps = MathRound(price / tickSize);
         return NormalizeDouble(steps * tickSize, digits);
        }
      return NormalizeDouble(price, digits);
     }

   static bool IsFinitePositive(const double v)
     {
      return (MathIsValidNumber(v) && v > 0.0);
     }

   static string FormatMoney(const double v, const string currency)
     {
      return StringFormat("%s %s", DoubleToString(v, 2), currency);
     }

   static string FormatPrice(const double v, const int digits)
     {
      return DoubleToString(v, digits);
     }
  };
//+------------------------------------------------------------------+
