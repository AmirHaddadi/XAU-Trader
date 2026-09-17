//+------------------------------------------------------------------+
//|                                                     Handlers.mqh  |
//|   XAU-Trader — dispatches inbound Bridge -> EA messages. Phase A  |
//|   only implements bars.request (read-only chart history); order   |
//|   actions/risk preview/history requests are wired in Phases B/C.  |
//|   This is the new "front door" replacing Panel.mqh's HandleEvent  |
//|   switch — same responsibility, different transport.              |
//+------------------------------------------------------------------+
#property strict
#include "JsonUtils.mqh"
#include "Protocol.mqh"
#include "SocketClient.mqh"

class CBridgeHandlers
  {
public:
   static void Dispatch(CSocketClient &client, const string line)
     {
      string msgType = CJsonUtils::ExtractType(line);

      if(msgType == "bars.request")
        {
         HandleBarsRequest(client, line);
         return;
        }

      // Unknown/not-yet-implemented message type — log and move on rather
      // than dropping the connection over a forward-compatibility gap.
      Print("XAU Trader Bridge: no handler for inbound '", msgType, "'");
     }

private:
   static void HandleBarsRequest(CSocketClient &client, const string line)
     {
      string reqId     = CJsonUtils::ExtractReqId(line);
      string symbol    = CProtocol::ReadBarsRequestSymbol(line);
      string tfString  = CProtocol::ReadBarsRequestTimeframe(line);
      int    count     = CProtocol::ReadBarsRequestCount(line);
      ENUM_TIMEFRAMES tf = TimeframeFromString(tfString);

      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      int copied = CopyRates(symbol, tf, 0, count, rates);
      if(copied <= 0)
        {
         Print("XAU Trader Bridge: CopyRates(", symbol, ", ", tfString, ") failed (", GetLastError(), ")");
         ArrayResize(rates, 0);
        }
      else
        {
         // Bridge/web expect oldest-first, matching how a chart is drawn left-to-right.
         ArraySetAsSeries(rates, false);
        }

      client.SendLine(CProtocol::BuildBarsData(reqId, symbol, tfString, rates));
     }

   static ENUM_TIMEFRAMES TimeframeFromString(const string tf)
     {
      if(tf == "M1")  return PERIOD_M1;
      if(tf == "M5")  return PERIOD_M5;
      if(tf == "M15") return PERIOD_M15;
      if(tf == "M30") return PERIOD_M30;
      if(tf == "H1")  return PERIOD_H1;
      if(tf == "H4")  return PERIOD_H4;
      if(tf == "D1")  return PERIOD_D1;
      if(tf == "W1")  return PERIOD_W1;
      if(tf == "MN1") return PERIOD_MN1;
      return PERIOD_M1;
     }
  };
//+------------------------------------------------------------------+
