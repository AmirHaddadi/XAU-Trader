//+------------------------------------------------------------------+
//|                                                 XAU_Trader.mq5    |
//|                                        Copyright 2026, Amirreza Haddadi |
//|                              https://github.com/AmirHaddadi/XAU-Trader |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Amirreza Haddadi"
#property link      "https://github.com/AmirHaddadi/XAU-Trader"
#property version   "1.00"
#property description "Real-time position sizing & money-management panel — draw your entry/SL/TP, choose market/limit/stop, and XAU Trader computes broker-valid lots from a %balance, %equity or fixed-$ risk budget."
#property strict

#resource "\\Fonts\\Vazir-Medium.ttf"
#resource "\\Fonts\\MiSans-Regular.ttf"

#include <XAUTrader/Core/Defines.mqh>
#include <XAUTrader/Core/Types.mqh>
#include <XAUTrader/Money/SymbolInfoCache.mqh>
#include <XAUTrader/Money/RiskEngine.mqh>
#include <XAUTrader/Trading/OrderManager.mqh>
#include <XAUTrader/Trading/PositionTracker.mqh>
#include <XAUTrader/Chart/LevelLines.mqh>
#include <XAUTrader/Chart/PositionLines.mqh>
#include <XAUTrader/GUI/Theme.mqh>
#include <XAUTrader/GUI/Panel.mqh>
#include <XAUTrader/Config/SettingsStore.mqh>

input ulong  InpMagicNumber       = 574839201;  // Magic number for orders placed by this panel
input int    InpDeviationPoints   = 20;         // Max price deviation (points) for market orders

CPanel          g_panel;
COrderManager   g_orderMgr;
CLevelLines     g_lines;
CPositionLines  g_posLines;
SAppSettings    g_settings;
string          g_currency;
bool            g_ready = false;

// OnTick can fire many times a second on an active symbol; re-running the
// risk engine and rewriting ~30 label objects + ChartRedraw() on every
// single one made keyboard/drag input feel laggy (input competes with a
// flood of tick-driven redraws). Recompute() itself is throttled to this
// cadence; user-initiated redraws (keystrokes, clicks) always bypass it by
// calling Recompute() directly, so those still feel instant.
#define XAUT_RECOMPUTE_MIN_MS 150
ulong g_lastRecomputeMs = 0;

// Position list only needs to reflect reality, not literally every tick.
#define XAUT_POSITION_SCAN_MIN_MS 500
ulong g_lastPositionScanMs = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   CSettingsStore::Load(g_settings);
   g_currency = AccountInfoString(ACCOUNT_CURRENCY);

   g_lines.Init(ChartID());
   g_posLines.Init(ChartID());
   g_orderMgr.Init(InpMagicNumber, InpDeviationPoints, "XAU-Trader");

   if(!g_panel.Create(ChartID(), g_settings))
     {
      Print("XAU Trader: failed to create the panel (", GetLastError(), ")");
      return(INIT_FAILED);
     }

   STradePlan plan;
   plan.Defaults();
   g_panel.SetPlan(plan);

   ChartSetInteger(ChartID(), CHART_EVENT_MOUSE_MOVE, true);
   EventSetMillisecondTimer(250);

   g_ready = true;
   // Unconditional on attach/reinit (timeframe switch, template reload,
   // terminal restart...) so an already-open position is picked back up
   // immediately instead of only appearing on the next tick.
   ScanAndRenderPositions();
   Recompute();
   ChartRedraw();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   CSettingsStore::Save(g_panel.GetSettings());
   g_lines.Clear();
   g_panel.Destroy();
   // Position lines represent real, still-open trades — only a true
   // removal/chart-close should erase them. A timeframe/template/parameter
   // change reinitializes the EA a moment later, and that fresh OnInit
   // re-scans and re-adopts the same ticket-named objects seamlessly; not
   // clearing them here avoids a pointless flash of the lines disappearing
   // and reappearing.
   if(reason == REASON_REMOVE || reason == REASON_CHARTCLOSE)
      g_posLines.Clear();
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(!g_ready) return;
   RecomputeThrottled();
   ScanAndRenderPositionsThrottled();
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!g_ready) return;
   g_panel.ToggleCaret();
   g_panel.ClearArmedState();
   g_panel.Draw(); // guarantees the caret blinks even between ticks (market closed, weekend)
   RecomputeThrottled();
   ScanAndRenderPositionsThrottled();
   FlushPendingPositionModify();
  }

//+------------------------------------------------------------------+
//| Dragging a real position's SL/TP line fires OBJECT_DRAG on every    |
//| pixel of mouse movement, not just on release. Sending a real        |
//| modify request to the broker for each one would spam the server     |
//| and make the drag feel laggy, so only the *values* update           |
//| immediately (visually the line already moves natively); the actual  |
//| server call is throttled, with OnTimer guaranteeing the final       |
//| dragged value still gets flushed shortly after the user lets go.    |
//+------------------------------------------------------------------+
#define XAUT_POS_MODIFY_MIN_MS 350
ulong  g_lastPosModifyMs = 0;
bool   g_posModifyDirty  = false;
ulong  g_posModifyTicket = 0;
double g_posModifySL     = 0.0;
double g_posModifyTP     = 0.0;

void FlushPendingPositionModify()
  {
   if(!g_posModifyDirty)
      return;
   ulong now = GetTickCount64();
   if(now - g_lastPosModifyMs < XAUT_POS_MODIFY_MIN_MS)
      return;
   g_lastPosModifyMs = now;
   g_posModifyDirty = false;

   SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
   string msg;
   if(!g_orderMgr.ModifyPosition(g_posModifyTicket, g_posModifySL, g_posModifyTP, sym, msg))
      Print("XAU Trader: position #", g_posModifyTicket, " modify failed — ", msg);
   ScanAndRenderPositions();
  }

//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(!g_ready) return;

   if(id == CHARTEVENT_OBJECT_DRAG)
     {
      ulong posTicket = 0;
      double posPrice = 0.0;
      string posWhich = g_posLines.DraggedLevel(sparam, posTicket, posPrice);
      if(posWhich != "")
        {
         SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
         if(sym.valid)
            posPrice = NormalizeDouble(posPrice, sym.digits);
         if(!PositionSelectByTicket(posTicket))
           {
            ScanAndRenderPositions();
            return;
           }
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         // A pending drag on the *other* line for the same ticket hasn't
         // been sent to the server yet — build on that pending value
         // instead of the stale server one, or the two would fight and
         // whichever flushes last would silently undo the other.
         if(g_posModifyDirty && g_posModifyTicket == posTicket)
           {
            sl = g_posModifySL;
            tp = g_posModifyTP;
           }
         if(posWhich == "sl") sl = posPrice; else tp = posPrice;

         g_posModifyDirty  = true;
         g_posModifyTicket = posTicket;
         g_posModifySL     = sl;
         g_posModifyTP     = tp;
         FlushPendingPositionModify();
         return;
        }

      double price = 0.0;
      string which = g_lines.DraggedLevel(sparam, price);
      if(which != "")
        {
         STradePlan plan = g_panel.GetPlan();
         SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
         if(sym.valid)
            price = NormalizeDouble(price, sym.digits);
         if(which == "entry")     plan.entryPrice = price;
         else if(which == "sl")   { plan.slPrice = price; plan.slUserSet = true; }
         else if(which == "tp")   { plan.tpPrice = price; plan.tpUserSet = true; }
         g_panel.SetPlan(plan);
         Recompute();
         return;
        }

      // The panel bitmap is selectable (needed so a click on it doesn't
      // fall through to the chart's own click-drag-to-pan/scroll), which
      // means MT5 will also try to natively drag it on ANY click-drag
      // inside it — including e.g. the risk slider, which isn't supposed
      // to move the panel at all. We do all our own dragging manually via
      // mouse-move tracking, so any native drag that isn't our own
      // in-progress header drag gets reverted immediately.
      if(sparam == XAUT_PANEL_OBJ)
        {
         if(!g_panel.IsDraggingPanel())
            g_panel.SnapBackPosition();
         return;
        }
      return;
     }

   if(id == CHARTEVENT_CHART_CHANGE)
     {
      g_lines.RepositionLabels();
      return;
     }

   ENUM_PANEL_ACTION action = g_panel.HandleEvent(id, lparam, dparam, sparam);
   switch(action)
     {
      case PANEL_ACTION_SETTINGS_CHANGED:
         CSettingsStore::Save(g_panel.GetSettings());
         break;

      case PANEL_ACTION_REDRAW_LINES:
         Recompute();
         break;

      case PANEL_ACTION_SEND_BUY:
      case PANEL_ACTION_SEND_SELL:
         SendFromPanel(action == PANEL_ACTION_SEND_BUY ? TRADE_DIR_BUY : TRADE_DIR_SELL);
         break;

      case PANEL_ACTION_CLOSE_REQUESTED:
         ExpertRemove();
         break;

      case PANEL_ACTION_CLOSE_POSITION:
        {
         ulong ticket = g_panel.ConsumeCloseRequest();
         if(ticket != 0)
           {
            string msg;
            if(!g_orderMgr.ClosePosition(ticket, msg))
               Print("XAU Trader: close #", ticket, " failed — ", msg);
            ScanAndRenderPositions();
           }
         break;
        }

      default:
         break;
     }
  }

//+------------------------------------------------------------------+
void RecomputeThrottled()
  {
   ulong now = GetTickCount64();
   if(now - g_lastRecomputeMs < XAUT_RECOMPUTE_MIN_MS)
      return;
   g_lastRecomputeMs = now;
   Recompute();
  }

//+------------------------------------------------------------------+
void ScanAndRenderPositionsThrottled()
  {
   ulong now = GetTickCount64();
   if(now - g_lastPositionScanMs < XAUT_POSITION_SCAN_MIN_MS)
      return;
   g_lastPositionScanMs = now;
   ScanAndRenderPositions();
  }

//+------------------------------------------------------------------+
void ScanAndRenderPositions()
  {
   SPositionInfo positions[];
   CPositionTracker::ScanSymbol(_Symbol, positions);
   g_panel.SetPositions(positions);

   SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
   SPalette pal = CTheme::Get(g_panel.GetSettings().theme);
   g_posLines.Render(positions, pal, g_panel.GetSettings().lang, g_currency, sym.valid ? sym.digits : _Digits);

   if(g_panel.GetSettings().collapsed == false)
      g_panel.Draw(); // refresh the header's position-count badge / open list
  }

//+------------------------------------------------------------------+
//| Re-reads the symbol/account snapshot, seeds a sensible SL/TP        |
//| default (until the user takes ownership of either), infers trade   |
//| direction from the SL/Entry relationship, re-runs the risk engine   |
//| and pushes the result into both the panel and the chart lines.      |
//+------------------------------------------------------------------+
void Recompute()
  {
   SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
   STradePlan plan = g_panel.GetPlan();

   double refEntry = (plan.placement == PLACEMENT_MARKET) ? sym.ask
                      : (plan.entryPrice > 0.0 ? plan.entryPrice : sym.ask);

   if(sym.valid && refEntry > 0.0)
     {
      if(!plan.slUserSet)
        {
         double defDist = refEntry * (XAUT_DEFAULT_STOP_PERCENT / 100.0);
         double minDist = (sym.stopsLevelPoints > 0) ? sym.stopsLevelPoints * sym.point * 1.5 : 0.0;
         defDist = MathMax(defDist, minDist);
         plan.slPrice = refEntry - defDist; // default bias: long, mirrors the BUY default direction
        }
      if(!plan.tpUserSet && plan.slPrice > 0.0)
        {
         double dist = MathAbs(refEntry - plan.slPrice);
         bool buyBias = (plan.slPrice < refEntry);
         plan.tpPrice = buyBias ? refEntry + XAUT_DEFAULT_REWARD_RATIO * dist
                                 : refEntry - XAUT_DEFAULT_REWARD_RATIO * dist;
        }
     }

   if(plan.slPrice > 0.0 && refEntry > 0.0)
      plan.direction = (plan.slPrice < refEntry) ? TRADE_DIR_BUY : TRADE_DIR_SELL;
   g_panel.SetPlan(plan);

   SRiskResult res = CRiskEngine::Evaluate(plan, sym);
   g_panel.UpdateMarket(res, sym, g_currency);
   g_panel.Draw();

   SPalette pal = CTheme::Get(g_panel.GetSettings().theme);
   bool marketMode = (plan.placement == PLACEMENT_MARKET);
   double lineEntry = marketMode ? ((plan.direction == TRADE_DIR_BUY) ? sym.ask : sym.bid) : plan.entryPrice;

   g_lines.Render(pal, g_panel.GetSettings().lang, g_currency,
                  lineEntry, plan.slPrice, plan.tpPrice,
                  !marketMode, sym.valid ? sym.digits : _Digits,
                  res.riskMoney, res.rewardMoney);
  }

//+------------------------------------------------------------------+
void SendFromPanel(const ENUM_TRADE_DIR dir)
  {
   STradePlan plan = g_panel.GetPlan();
   plan.direction = dir;
   SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
   SRiskResult res = CRiskEngine::Evaluate(plan, sym);

   if(res.code != VALID_OK || res.lots <= 0.0)
     {
      Recompute();
      return;
     }

   string msg; ulong ticket;
   bool ok = g_orderMgr.Send(plan, res.lots, sym, msg, ticket);
   if(!ok)
     {
      Print("XAU Trader: order failed — ", msg);
      Recompute();
      return;
     }

   Print("XAU Trader: order placed, ticket=", ticket);
   // Reset the ticket to a clean slate for the next trade rather than
   // leaving the just-submitted numbers sitting in the fields (confusing,
   // and one accidental extra click away from a duplicate order).
   STradePlan fresh;
   fresh.Defaults();
   fresh.riskMode = plan.riskMode;
   fresh.riskValue = plan.riskValue;
   fresh.placement = plan.placement;
   g_panel.SetPlan(fresh);

   ScanAndRenderPositions();
   Recompute();
  }
//+------------------------------------------------------------------+
