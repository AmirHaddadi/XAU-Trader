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
#include "HistoryScanner.mqh"

//--- 350ms position-modify coalescing — mirrors XAU_Trader.mq5's
//--- pre-existing g_posModify* pattern for native chart-line dragging; same
//--- "don't spam the broker per drag pixel" reasoning, just fed by inbound
//--- order.modifyPosition messages instead of CHARTEVENT_OBJECT_DRAG.
#define XAUT_BRIDGE_MODIFY_FLUSH_MIN_MS 350

//--- How often the currently-subscribed live bar is re-pushed (see
//--- CBridgeHandlers::PushBarUpdate). Independent of the tick throttle —
//--- a chart doesn't need per-tick precision, this is about "does it look
//--- alive", not matching every price fluctuation.
#define XAUT_BAR_PUSH_MIN_MS 500

class CBridgeHandlers
  {
private:
   bool   m_modifyDirty;
   ulong  m_modifyTicket;
   double m_modifySl;
   double m_modifyTp;
   ulong  m_lastModifyFlushMs;

   CHistoryScanner m_history;

   //--- The web chart's current "subscription" — set by whichever
   //--- bars.request came in most recently (a timeframe switch just
   //--- re-requests, which naturally replaces this). Bug found live: this
   //--- subscription previously didn't exist at all, so no bar.update was
   //--- ever pushed and the chart only ever painted once, on initial load.
   string          m_liveSymbol;
   string          m_liveTfString;
   ENUM_TIMEFRAMES m_liveTf;
   ulong           m_lastBarPushMs;

public:
   CBridgeHandlers()
     {
      m_modifyDirty = false;
      m_modifyTicket = 0;
      m_modifySl = 0.0;
      m_modifyTp = 0.0;
      m_lastModifyFlushMs = 0;
      m_liveSymbol = "";
      m_liveTfString = "";
      m_liveTf = PERIOD_CURRENT;
      m_lastBarPushMs = 0;
     }

   //--- Returns true if positions likely changed and the caller should
   //--- re-scan/re-render/re-push (same idea as ScanAndRenderPositions()).
   //--- `activeSymbol` is a reference, not a plain value, specifically so
   //--- HandleSymbolSelect() below can switch it in place — every other
   //--- branch just reads whatever it currently holds. See XAU_Trader.mq5's
   //--- g_activeSymbol, the only thing this reference ever actually points at.
   bool Dispatch(CSocketClient &client, COrderManager &orderMgr, string &activeSymbol, const string line)
     {
      string msgType = CJsonUtils::ExtractType(line);
      string reqId = CJsonUtils::ExtractReqId(line);

      if(msgType == "bars.request")
        {
         HandleBarsRequest(client, line);
         return false;
        }
      if(msgType == "symbol.select")
        {
         HandleSymbolSelect(client, activeSymbol, line);
         // Positions/journal are scoped to whichever symbol is active (see
         // ScanPositionsData()) — true here piggybacks on the caller's
         // existing "re-scan and re-push" path so switching symbol refreshes
         // the positions panel immediately instead of waiting out the next
         // 1000ms throttled push.
         return true;
        }
      if(msgType == "risk.preview")
        {
         HandleRiskPreview(client, activeSymbol, reqId, line);
         return false;
        }
      if(msgType == "order.send")
         return HandleOrderSend(client, orderMgr, activeSymbol, reqId, line);
      if(msgType == "order.modifyPending")
         return HandleOrderModifyPending(client, orderMgr, activeSymbol, reqId, line);
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
      if(msgType == "order.closePartial")
         return HandleOrderClosePartial(client, orderMgr, activeSymbol, reqId, line);
      if(msgType == "order.cancel")
         return HandleOrderCancel(client, orderMgr, reqId, line);
      if(msgType == "history.request")
        {
         HandleHistoryRequest(client, activeSymbol, reqId, line);
         return false;
        }

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

   //--- Call periodically (e.g. every 1000ms, same cadence as the position
   //--- scan) — pushes any newly-closed deals as a journal update.
   void PushNewDeals(CSocketClient &client, const string symbol)
     {
      SClosedDeal deals[];
      if(m_history.ScanNew(symbol, deals) > 0)
         client.SendLine(CProtocol::BuildHistoryNewDeals(deals));
     }

   //--- Call every OnTimer — pushes the currently-forming bar for whatever
   //--- symbol/timeframe the web chart last subscribed to via bars.request.
   //--- No-op until the first bars.request arrives (nothing to push yet).
   void PushBarUpdate(CSocketClient &client)
     {
      if(m_liveTfString == "")
         return;
      ulong now = GetTickCount64();
      if(now - m_lastBarPushMs < XAUT_BAR_PUSH_MIN_MS)
         return;
      m_lastBarPushMs = now;

      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      if(CopyRates(m_liveSymbol, m_liveTf, 0, 1, rates) <= 0)
         return; // no new data yet (e.g. market closed) — try again next tick

      client.SendLine(CProtocol::BuildBarUpdate(m_liveSymbol, m_liveTfString, rates[0]));
     }

private:
   //--- Switches the EA's active trading symbol and immediately pushes a
   //--- fresh symbol/tick snapshot for it — instant feedback rather than
   //--- waiting out PushBridgeStateThrottled's 1000ms cadence, same
   //--- reasoning as ScanAndRenderPositions()'s own instant re-push.
   //--- CSymbolInfoCache::Read() already calls SymbolSelect() internally, so
   //--- this also silently (re-)adds the symbol to Market Watch if needed.
   void HandleSymbolSelect(CSocketClient &client, string &activeSymbol, const string line)
     {
      string next = CProtocol::ReadSelectSymbol(line);
      if(next == "")
         return;
      activeSymbol = next;
      SSymbolSnapshot sym = CSymbolInfoCache::Read(activeSymbol);
      if(sym.valid)
        {
         client.SendLine(CProtocol::BuildSymbol(sym));
         client.SendLine(CProtocol::BuildTick(sym.symbol, sym.bid, sym.ask, TimeCurrent()));
        }
     }

   void HandleHistoryRequest(CSocketClient &client, const string symbol, const string reqId, const string line)
     {
      ulong sinceTicket = CProtocol::ReadHistoryRequestSinceTicket(line);
      SClosedDeal deals[];
      m_history.ScanSinceTicket(symbol, sinceTicket, deals);
      client.SendLine(CProtocol::BuildHistoryData(reqId, deals));
     }

   void HandleBarsRequest(CSocketClient &client, const string line)
     {
      string reqId     = CJsonUtils::ExtractReqId(line);
      string symbol    = CProtocol::ReadBarsRequestSymbol(line);
      string tfString  = CProtocol::ReadBarsRequestTimeframe(line);
      int    count     = CProtocol::ReadBarsRequestCount(line);
      int    offset    = CProtocol::ReadBarsRequestOffset(line);
      ENUM_TIMEFRAMES tf = TimeframeFromString(tfString);

      // Only an offset=0 request (initial load / refresh / timeframe
      // switch) re-subscribes for live bar.update pushes — a positive
      // offset is an older-history page the web chart is paging in as the
      // user pans back, and must not steal the live subscription out from
      // under whatever symbol/timeframe is actually on screen.
      if(offset == 0)
        {
         m_liveSymbol   = symbol;
         m_liveTfString = tfString;
         m_liveTf       = tf;
        }

      // start_pos=offset (0 = most recent) per CopyRates(symbol, tf,
      // start_pos, count, rates) — confirmed against MQL5 docs before
      // relying on it, not guessed: start_pos=0 is the current bar, higher
      // values page further into the past.
      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      int copied = CopyRates(symbol, tf, offset, count, rates);
      if(copied <= 0)
        {
         Print("XAU Trader Bridge: CopyRates(", symbol, ", ", tfString, ", offset=", offset, ") failed (", GetLastError(), ")");
         ArrayResize(rates, 0);
        }
      else
        {
         // Bridge/web expect oldest-first, matching how a chart is drawn left-to-right.
         ArraySetAsSeries(rates, false);
        }

      client.SendLine(CProtocol::BuildBarsData(reqId, symbol, tfString, rates, offset));
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

   bool HandleOrderClosePartial(CSocketClient &client, COrderManager &orderMgr, const string symbol, const string reqId, const string line)
     {
      ulong ticket = CProtocol::ReadTicket(line);
      double volume = CProtocol::ReadVolume(line);
      SSymbolSnapshot sym = CSymbolInfoCache::Read(symbol);
      string msg;
      bool ok = orderMgr.ClosePositionPartial(ticket, volume, sym, msg);
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
