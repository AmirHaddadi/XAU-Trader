//+------------------------------------------------------------------+
//|                                                     Handlers.mqh  |
//|   XAU-Trader — dispatches inbound Bridge -> EA messages into the  |
//|   unchanged CRiskEngine/COrderManager/CopyRates. This is the new  |
//|   "front door" replacing Panel.mqh's HandleEvent/ENUM_PANEL_ACTION|
//|   switch — same responsibility (validate, size, send, modify,     |
//|   close), different transport. Dispatch()/FlushPendingModify()    |
//|   return true when the caller should re-scan/re-render/re-push    |
//|   positions, mirroring how Panel.mqh used to report back via its  |
//|   own action-code enum rather than reaching into XAU_Trader.mq5   |
//|   directly.                                                       |
//+------------------------------------------------------------------+
#property strict
#include "JsonUtils.mqh"
#include "Protocol.mqh"
#include "SocketClient.mqh"
#include "../Money/RiskEngine.mqh"
#include "../Money/SymbolInfoCache.mqh"
#include "../Trading/OrderManager.mqh"

//--- 350ms position-modify coalescing — mirrors XAU_Trader.mq5's
//--- pre-existing g_posModify* pattern for native chart-line dragging; same
//--- "don't spam the broker per drag pixel" reasoning, just fed by inbound
//--- order.modifyPosition messages instead of CHARTEVENT_OBJECT_DRAG.
#define XAUT_BRIDGE_MODIFY_FLUSH_MIN_MS 350

class CBridgeHandlers
  {
private:
   bool   m_modifyDirty;
   ulong  m_modifyTicket;
   double m_modifySl;
   double m_modifyTp;
   ulong  m_lastModifyFlushMs;

public:
   CBridgeHandlers()
     {
      m_modifyDirty = false;
      m_modifyTicket = 0;
      m_modifySl = 0.0;
      m_modifyTp = 0.0;
      m_lastModifyFlushMs = 0;
     }

   //--- Returns true if positions likely changed and the caller should
   //--- re-scan/re-render/re-push (same idea as ScanAndRenderPositions()).
   bool Dispatch(CSocketClient &client, COrderManager &orderMgr, const string symbol, const string line)
     {
      string msgType = CJsonUtils::ExtractType(line);
      string reqId = CJsonUtils::ExtractReqId(line);

      if(msgType == "bars.request")
        {
         HandleBarsRequest(client, line);
         return false;
        }
      if(msgType == "risk.preview")
        {
         HandleRiskPreview(client, symbol, reqId, line);
         return false;
        }
      if(msgType == "order.send")
         return HandleOrderSend(client, orderMgr, symbol, reqId, line);
      if(msgType == "order.modifyPending")
         return HandleOrderModifyPending(client, orderMgr, symbol, reqId, line);
      if(msgType == "order.modifyPosition")
        {
         // The real ModifyPosition call happens in FlushPendingModify(),
         // throttled — queuing here just records the latest dragged value.
         m_modifyTicket = CProtocol::ReadTicket(line);
         m_modifySl     = CProtocol::ReadSl(line);
         m_modifyTp     = CProtocol::ReadTp(line);
         m_modifyDirty  = true;
         return false;
        }
      if(msgType == "order.close")
         return HandleOrderClose(client, orderMgr, reqId, line);
      if(msgType == "order.cancel")
         return HandleOrderCancel(client, orderMgr, reqId, line);

      // Unknown/not-yet-implemented message type — log and move on rather
      // than dropping the connection over a forward-compatibility gap.
      Print("XAU Trader Bridge: no handler for inbound '", msgType, "'");
      return false;
     }

   //--- Call every OnTimer regardless of new messages, same cadence as the
   //--- native panel's FlushPendingPositionModify(). Returns true if a
   //--- modify actually flushed (positions changed).
   bool FlushPendingModify(CSocketClient &client, COrderManager &orderMgr, const string symbol)
     {
      if(!m_modifyDirty)
         return false;
      ulong now = GetTickCount64();
      if(now - m_lastModifyFlushMs < XAUT_BRIDGE_MODIFY_FLUSH_MIN_MS)
         return false;
      m_lastModifyFlushMs = now;
      m_modifyDirty = false;

      SSymbolSnapshot sym = CSymbolInfoCache::Read(symbol);
      string msg;
      bool ok = orderMgr.ModifyPosition(m_modifyTicket, m_modifySl, m_modifyTp, sym, msg);
      if(!ok)
        {
         string payload = StringFormat("{\"message\":\"position #%d modify failed — %s\"}", m_modifyTicket, CJsonUtils::Escape(msg));
         client.SendLine(CProtocol::Envelope("error", payload));
        }
      return ok;
     }

private:
   void HandleBarsRequest(CSocketClient &client, const string line)
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

   void HandleRiskPreview(CSocketClient &client, const string symbol, const string reqId, const string line)
     {
      STradePlan plan = CProtocol::ParseTradePlan(line);
      SSymbolSnapshot sym = CSymbolInfoCache::Read(symbol);
      SRiskResult res = CRiskEngine::Evaluate(plan, sym);
      client.SendLine(CProtocol::BuildRiskResult(reqId, res));
     }

   //--- Mirrors SendFromPanel(): re-validate with a fresh snapshot right
   //--- before sending, never trust a risk.preview result that may be stale.
   bool HandleOrderSend(CSocketClient &client, COrderManager &orderMgr, const string symbol, const string reqId, const string line)
     {
      STradePlan plan = CProtocol::ParseTradePlan(line);
      SSymbolSnapshot sym = CSymbolInfoCache::Read(symbol);
      SRiskResult res = CRiskEngine::Evaluate(plan, sym);

      if(res.code != VALID_OK || res.lots <= 0.0)
        {
         client.SendLine(CProtocol::BuildOrderAck(reqId, false, CProtocol::ValidationCodeToString(res.code)));
         return false;
        }

      string msg; ulong ticket;
      bool ok = orderMgr.Send(plan, res.lots, sym, msg, ticket);
      client.SendLine(CProtocol::BuildOrderAck(reqId, ok, msg, ticket));
      return ok;
     }

   bool HandleOrderModifyPending(CSocketClient &client, COrderManager &orderMgr, const string symbol, const string reqId, const string line)
     {
      ulong ticket = CProtocol::ReadTicket(line);
      double price = CProtocol::ReadPrice(line);
      double sl    = CProtocol::ReadSl(line);
      double tp    = CProtocol::ReadTp(line);
      SSymbolSnapshot sym = CSymbolInfoCache::Read(symbol);

      string msg;
      bool ok = orderMgr.ModifyPending(ticket, price, sl, tp, sym, msg);
      client.SendLine(CProtocol::BuildOrderAck(reqId, ok, msg));
      return ok;
     }

   bool HandleOrderClose(CSocketClient &client, COrderManager &orderMgr, const string reqId, const string line)
     {
      ulong ticket = CProtocol::ReadTicket(line);
      string msg;
      bool ok = orderMgr.ClosePosition(ticket, msg);
      client.SendLine(CProtocol::BuildOrderAck(reqId, ok, msg));
      return ok;
     }

   bool HandleOrderCancel(CSocketClient &client, COrderManager &orderMgr, const string reqId, const string line)
     {
      ulong ticket = CProtocol::ReadTicket(line);
      string msg;
      bool ok = orderMgr.CancelPending(ticket, msg);
      client.SendLine(CProtocol::BuildOrderAck(reqId, ok, msg));
      return ok;
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
