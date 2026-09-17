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
            positions[i].ticket, positions[i].type == POSITION_TYPE_BUY ? "buy" : "sell",
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

   // ---- Bridge -> EA readers ---------------------------------------------

   static string ReadBarsRequestSymbol(const string json)   { return CJsonUtils::ExtractString(json, "symbol"); }
   static string ReadBarsRequestTimeframe(const string json){ return CJsonUtils::ExtractString(json, "timeframe"); }
   static int    ReadBarsRequestCount(const string json)    { return (int)CJsonUtils::ExtractInt(json, "count", 500); }
  };
//+------------------------------------------------------------------+
