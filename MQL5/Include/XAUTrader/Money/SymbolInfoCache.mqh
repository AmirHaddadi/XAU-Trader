//+------------------------------------------------------------------+
//|                                             SymbolInfoCache.mqh   |
//|   XAU-Trader — per-tick snapshot of the broker/symbol properties  |
//|   the risk engine and validators need. Re-read every tick since   |
//|   stops level, trade mode and tick value can change intraday      |
//|   (session rollover, high-impact news widening, broker maint.).   |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Types.mqh"

class CSymbolInfoCache
  {
public:
   static SSymbolSnapshot Read(const string symbol)
     {
      SSymbolSnapshot s;
      s.symbol = symbol;
      s.valid  = false;

      if(symbol == "" || !SymbolSelect(symbol, true))
         return s;

      // SYMBOL_EXIST alone is not enough — a delisted/hidden symbol can still "select"
      if(!(bool)SymbolInfoInteger(symbol, SYMBOL_SELECT))
         return s;

      s.digits           = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      s.point            = SymbolInfoDouble(symbol, SYMBOL_POINT);
      s.bid              = SymbolInfoDouble(symbol, SYMBOL_BID);
      s.ask              = SymbolInfoDouble(symbol, SYMBOL_ASK);
      s.volumeMin        = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      s.volumeMax        = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      s.volumeStep       = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      s.tickSize         = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      s.tickValueProfit  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_PROFIT);
      s.tickValueLoss    = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
      s.stopsLevelPoints = (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL);
      s.freezeLevelPoints= (int)SymbolInfoInteger(symbol, SYMBOL_TRADE_FREEZE_LEVEL);
      s.tradeMode        = SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE);

      // Guard against brokers that report a zero tick size/value for exotic
      // instruments before the first tick has arrived after weekend/holiday gap.
      if(s.tickSize <= 0.0)
         s.tickSize = s.point;
      if(s.tickValueLoss <= 0.0)
         s.tickValueLoss = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      if(s.tickValueProfit <= 0.0)
         s.tickValueProfit = s.tickValueLoss;
      if(s.volumeStep <= 0.0)
         s.volumeStep = 0.01;

      s.valid = (s.bid > 0.0 && s.ask > 0.0 && s.point > 0.0);
      return s;
     }
  };
//+------------------------------------------------------------------+
