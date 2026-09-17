//+------------------------------------------------------------------+
//|                                                     Protocol.mqh  |
//|   XAU-Trader — wire message builders/readers for the EA<->bridge  |
//|   NDJSON protocol. Field names and message `type` strings mirror  |
//|   packages/protocol/src/ea-protocol.ts one-to-one — keep both in  |
//|   sync by hand when either side changes; there is no shared       |
//|   schema generator across MQL5/TypeScript.                        |
//+------------------------------------------------------------------+
#property strict
#include "JsonUtils.mqh"
#include "../Core/Types.mqh"
#include "../Core/Defines.mqh"
#include "HistoryScanner.mqh"

class CProtocol
  {
public:
   //--- Wraps a payload object (already-built JSON, e.g. "{...}") into the
   //--- standard {type,reqId?,payload} envelope.
   static string Envelope(const string msgType, const string payloadJson, const string reqId = "")
     {
      if(reqId == "")
         return StringFormat("{\"type\":\"%s\",\"payload\":%s}", msgType, payloadJson);
      return StringFormat("{\"type\":\"%s\",\"reqId\":\"%s\",\"payload\":%s}", msgType, CJsonUtils::Escape(reqId), payloadJson);
     }

   // ---- EA -> Bridge builders -------------------------------------------

   static string BuildHello(const long account, const string broker, const string symbol, const long magic, const string eaVersion)
     {
      string payload = StringFormat(
         "{\"account\":%d,\"broker\":\"%s\",\"symbol\":\"%s\",\"magic\":%d,\"eaVersion\":\"%s\"}",
         account, CJsonUtils::Escape(broker), CJsonUtils::Escape(symbol), magic, CJsonUtils::Escape(eaVersion));
      return Envelope("hello", payload);
     }

   static string BuildTick(const string symbol, const double bid, const double ask, const datetime time)
     {
      string payload = StringFormat(
         "{\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"time\":%d}",
         CJsonUtils::Escape(symbol), bid, ask, (long)time);
      return Envelope("tick", payload);
     }

   static string BuildAccount(const double balance, const double equity, const double freeMargin, const string currency)
     {
      string payload = StringFormat(
         "{\"balance\":%.2f,\"equity\":%.2f,\"freeMargin\":%.2f,\"currency\":\"%s\"}",
         balance, equity, freeMargin, CJsonUtils::Escape(currency));
      return Envelope("account", payload);
     }

   static string BuildSymbol(const SSymbolSnapshot &sym)
     {
      string payload = StringFormat(
         "{\"symbol\":\"%s\",\"digits\":%d,\"point\":%.8f,\"volumeMin\":%.2f,\"volumeMax\":%.2f,"
         "\"volumeStep\":%.2f,\"tickSize\":%.8f,\"tickValueProfit\":%.5f,\"tickValueLoss\":%.5f,"
         "\"stopsLevelPoints\":%d,\"freezeLevelPoints\":%d,\"tradeMode\":%d,\"valid\":%s}",
         CJsonUtils::Escape(sym.symbol), sym.digits, sym.point, sym.volumeMin, sym.volumeMax,
         sym.volumeStep, sym.tickSize, sym.tickValueProfit, sym.tickValueLoss,
         sym.stopsLevelPoints, sym.freezeLevelPoints, (int)sym.tradeMode, sym.valid ? "true" : "false");
      return Envelope("symbol", payload);
     }

   static string BuildPositions(const SPositionInfo &positions[])
     {
      string items = "";
      int total = ArraySize(positions);
      for(int i = 0; i < total; i++)
        {
         if(i > 0)
            items += ",";
         items += StringFormat(
            "{\"ticket\":%d,\"type\":\"%s\",\"volume\":%.2f,\"priceOpen\":%.5f,\"sl\":%.5f,"
            "\"tp\":%.5f,\"profit\":%.2f,\"magic\":%d,\"timeOpen\":%d}",
            positions[i].ticket, PositionTypeToString(positions[i].type),
            positions[i].volume, positions[i].priceOpen, positions[i].sl, positions[i].tp,
            positions[i].profit, positions[i].magic, (long)positions[i].timeOpen);
        }
      return Envelope("positions", "{\"positions\":[" + items + "]}");
     }

   static string BuildBarsData(const string reqId, const string symbol, const string timeframe, const MqlRates &rates[])
     {
      string items = "";
      int total = ArraySize(rates);
      for(int i = 0; i < total; i++)
        {
         if(i > 0)
            items += ",";
         items += StringFormat(
            "{\"time\":%d,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%d}",
            (long)rates[i].time, rates[i].open, rates[i].high, rates[i].low, rates[i].close,
            (long)rates[i].tick_volume);
        }
      string payload = StringFormat("{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"bars\":[%s]}",
                                     CJsonUtils::Escape(symbol), CJsonUtils::Escape(timeframe), items);
      return Envelope("bars.data", payload, reqId);
     }

   //--- Push for the currently-forming bar only — see CBridgeHandlers::PushBarUpdate.
   static string BuildBarUpdate(const string symbol, const string timeframe, const MqlRates &bar)
     {
      string barJson = StringFormat(
         "{\"time\":%d,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%d}",
         (long)bar.time, bar.open, bar.high, bar.low, bar.close, (long)bar.tick_volume);
      string payload = StringFormat("{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"bar\":%s}",
                                     CJsonUtils::Escape(symbol), CJsonUtils::Escape(timeframe), barJson);
      return Envelope("bar.update", payload);
     }

   static string BuildRiskResult(const string reqId, const SRiskResult &r)
     {
      string payload = StringFormat(
         "{\"code\":\"%s\",\"lots\":%.2f,\"rawLots\":%.4f,\"riskMoney\":%.2f,\"rewardMoney\":%.2f,"
         "\"rr\":%.2f,\"marginRequired\":%.2f,\"message\":\"%s\"}",
         ValidationCodeToString(r.code), r.lots, r.rawLots, r.riskMoney, r.rewardMoney,
         r.rr, r.marginRequired, CJsonUtils::Escape(r.message));
      return Envelope("risk.result", payload, reqId);
     }

   static string BuildOrderAck(const string reqId, const bool ok, const string message, const ulong ticket = 0)
     {
      string payload = StringFormat("{\"ok\":%s,\"message\":\"%s\",\"ticket\":%d}",
                                     ok ? "true" : "false", CJsonUtils::Escape(message), ticket);
      return Envelope("order.ack", payload, reqId);
     }

   static string BuildClosedDealJson(const SClosedDeal &d)
     {
      return StringFormat(
         "{\"dealTicket\":%d,\"positionTicket\":%d,\"symbol\":\"%s\",\"direction\":\"%s\",\"volume\":%.2f,"
         "\"priceOpen\":%.5f,\"priceClose\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"swap\":%.2f,"
         "\"commission\":%.2f,\"magic\":%d,\"timeOpen\":%d,\"timeClose\":%d}",
         d.dealTicket, d.positionTicket, CJsonUtils::Escape(d.symbol), DirectionToString(d.direction), d.volume,
         d.priceOpen, d.priceClose, d.sl, d.tp, d.profit, d.swap, d.commission, d.magic,
         (long)d.timeOpen, (long)d.timeClose);
     }

   static string BuildDealsArray(const SClosedDeal &deals[])
     {
      string items = "";
      int total = ArraySize(deals);
      for(int i = 0; i < total; i++)
        {
         if(i > 0)
            items += ",";
         items += BuildClosedDealJson(deals[i]);
        }
      return "[" + items + "]";
     }

   static string BuildHistoryNewDeals(const SClosedDeal &deals[])
     {
      return Envelope("history.newDeals", "{\"deals\":" + BuildDealsArray(deals) + "}");
     }

   static string BuildHistoryData(const string reqId, const SClosedDeal &deals[])
     {
      return Envelope("history.data", "{\"deals\":" + BuildDealsArray(deals) + "}", reqId);
     }

   static ulong ReadHistoryRequestSinceTicket(const string json)
     {
      return (ulong)CJsonUtils::ExtractInt(json, "sinceTicket", 0);
     }

   // ---- Bridge -> EA readers ---------------------------------------------

   static string ReadBarsRequestSymbol(const string json)   { return CJsonUtils::ExtractString(json, "symbol"); }
   static string ReadBarsRequestTimeframe(const string json){ return CJsonUtils::ExtractString(json, "timeframe"); }
   static int    ReadBarsRequestCount(const string json)    { return (int)CJsonUtils::ExtractInt(json, "count", 500); }

   //--- Parses the flat "plan" object nested in risk.preview/order.send
   //--- payloads into an STradePlan. Field names are unique across the
   //--- envelope, so whole-message substring extraction is safe.
   static STradePlan ParseTradePlan(const string json)
     {
      STradePlan plan;
      plan.Defaults();
      plan.riskMode   = ParseRiskMode(CJsonUtils::ExtractString(json, "riskMode"));
      plan.riskValue  = CJsonUtils::ExtractNumber(json, "riskValue");
      plan.placement  = ParsePlacement(CJsonUtils::ExtractString(json, "placement"));
      plan.direction  = ParseDirection(CJsonUtils::ExtractString(json, "direction"));
      plan.entryPrice = CJsonUtils::ExtractNumber(json, "entryPrice");
      plan.slPrice    = CJsonUtils::ExtractNumber(json, "slPrice");
      plan.tpPrice    = CJsonUtils::ExtractNumber(json, "tpPrice");
      plan.rrRatio    = CJsonUtils::ExtractNumber(json, "rrRatio", XAUT_DEFAULT_REWARD_RATIO);
      plan.slUserSet  = CJsonUtils::ExtractBool(json, "slUserSet");
      plan.tpUserSet  = CJsonUtils::ExtractBool(json, "tpUserSet");
      return plan;
     }

   static ulong ReadTicket(const string json) { return (ulong)CJsonUtils::ExtractInt(json, "ticket"); }
   static double ReadPrice(const string json) { return CJsonUtils::ExtractNumber(json, "price"); }
   static double ReadSl(const string json)    { return CJsonUtils::ExtractNumber(json, "sl"); }
   static double ReadTp(const string json)    { return CJsonUtils::ExtractNumber(json, "tp"); }

   static ENUM_RISK_MODE ParseRiskMode(const string s)
     {
      if(s == "percent_equity") return RISK_MODE_PERCENT_EQUITY;
      if(s == "fixed_money")    return RISK_MODE_FIXED_MONEY;
      return RISK_MODE_PERCENT_BALANCE;
     }

   static ENUM_PLACEMENT_TYPE ParsePlacement(const string s)
     {
      if(s == "limit") return PLACEMENT_LIMIT;
      if(s == "stop")  return PLACEMENT_STOP;
      return PLACEMENT_MARKET;
     }

   static ENUM_TRADE_DIR ParseDirection(const string s)
     {
      return (s == "sell") ? TRADE_DIR_SELL : TRADE_DIR_BUY;
     }

   static string DirectionToString(const ENUM_TRADE_DIR d)
     {
      return (d == TRADE_DIR_SELL) ? "sell" : "buy";
     }

   static string PositionTypeToString(const ENUM_POSITION_TYPE t)
     {
      return (t == POSITION_TYPE_SELL) ? "sell" : "buy";
     }

   //--- Mirrors ENUM_VALIDATION_CODE in Core/Defines.mqh; keep in sync with
   //--- packages/protocol/src/domain.ts's ValidationCode union by hand.
   static string ValidationCodeToString(const ENUM_VALIDATION_CODE code)
     {
      switch(code)
        {
         case VALID_OK:                     return "ok";
         case VALID_ERR_NO_SYMBOL:          return "err_no_symbol";
         case VALID_ERR_TRADE_DISABLED:     return "err_trade_disabled";
         case VALID_ERR_MARKET_CLOSED:      return "err_market_closed";
         case VALID_ERR_SL_MISSING:         return "err_sl_missing";
         case VALID_ERR_SL_WRONG_SIDE:      return "err_sl_wrong_side";
         case VALID_ERR_TP_WRONG_SIDE:      return "err_tp_wrong_side";
         case VALID_ERR_STOPS_LEVEL:        return "err_stops_level";
         case VALID_ERR_FREEZE_LEVEL:       return "err_freeze_level";
         case VALID_ERR_VOLUME_TOO_SMALL:   return "err_volume_too_small";
         case VALID_ERR_VOLUME_TOO_LARGE:   return "err_volume_too_large";
         case VALID_ERR_MARGIN:             return "err_margin";
         case VALID_ERR_RISK_VALUE:         return "err_risk_value";
         case VALID_ERR_ENTRY_WRONG_SIDE:   return "err_entry_wrong_side";
         case VALID_ERR_BUSY:               return "err_busy";
         default:                           return "err_risk_value";
        }
     }
  };
//+------------------------------------------------------------------+
