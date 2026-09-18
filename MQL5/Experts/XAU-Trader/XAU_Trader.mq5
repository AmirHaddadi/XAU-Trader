//+------------------------------------------------------------------+
//|                                                 XAU_Trader.mq5    |
//|                                        Copyright 2026, Amirreza Haddadi |
//|                              https://github.com/AmirHaddadi/XAU-Trader |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, Amirreza Haddadi"
#property link      "https://github.com/AmirHaddadi/XAU-Trader"
#property version   "1.1"
#property description "Position sizing & money-management engine for XAUUSD. Drives the local XAU-Trader web platform (bridge + browser dashboard) by default; the legacy on-chart panel can be re-enabled via XAUT_LEGACY_PANEL below for rollback."
#property strict

// Native on-chart UI (Panel/LevelLines/PositionLines) is retired as of the
// web re-platform's Phase B — the browser dashboard is the primary UI now.
// Left compiled-but-disabled (not deleted) for a cheap rollback net through
// Phase C; uncomment to bring it back. See the approved plan in
// Evolved-FullStack-NewStack.md / .claude/plans.
//#define XAUT_LEGACY_PANEL

#resource "\\Fonts\\Vazir-Medium.ttf"
#resource "\\Fonts\\MiSans-Regular.ttf"

#include <XAUTrader/Core/Defines.mqh>
#include <XAUTrader/Core/Types.mqh>
#include <XAUTrader/Money/SymbolInfoCache.mqh>
#include <XAUTrader/Money/RiskEngine.mqh>
#include <XAUTrader/Trading/OrderManager.mqh>
#include <XAUTrader/Trading/PositionTracker.mqh>
#include <XAUTrader/Bridge/SocketClient.mqh>
#include <XAUTrader/Bridge/Protocol.mqh>
#include <XAUTrader/Bridge/Handlers.mqh>
#include <XAUTrader/Bridge/LaunchButton.mqh>
#ifdef XAUT_LEGACY_PANEL
#include <XAUTrader/Chart/LevelLines.mqh>
#include <XAUTrader/Chart/PositionLines.mqh>
#include <XAUTrader/GUI/Theme.mqh>
#include <XAUTrader/GUI/Panel.mqh>
#include <XAUTrader/Config/SettingsStore.mqh>
#endif

#define XAUT_EA_VERSION "1.1.0" // kept in sync with #property version above; reported in the bridge "hello" handshake

input ulong   InpMagicNumber       = 574839201;  // Magic number for orders placed by this panel
input int     InpDeviationPoints   = 20;         // Max price deviation (points) for market orders
input string  InpBridgeHost        = "127.0.0.1"; // Local web-platform bridge host (never change unless the bridge itself is remote)
input int     InpBridgePort        = 9443;        // Local web-platform bridge TCP port — must match apps/bridge's EA_TCP_PORT
input string  InpBridgeExePath     = "";          // Full path to xautrader-bridge.exe (from build/package-windows/out/win) — required for the Launch Platform button
input int     InpWebPort           = 3000;        // Web dashboard port opened in the browser — must match the bridge's WEB_PORT (3000 = Next.js's own default, works for both `next dev` and the packaged build)

COrderManager   g_orderMgr;
string          g_currency;
bool            g_ready = false;

#ifdef XAUT_LEGACY_PANEL
CPanel          g_panel;
CLevelLines     g_lines;
CPositionLines  g_posLines;
SAppSettings    g_settings;
#endif

// The bridge is now the primary front door (see Bridge/Handlers.mqh) —
// it owns order actions/risk preview via CRiskEngine/COrderManager exactly
// like the legacy panel used to, just over a socket instead of chart events.
CSocketClient   g_bridge;
CBridgeHandlers g_bridgeHandlers;
CLaunchButton   g_launchBtn;
bool            g_bridgeWasConnected = false;

#define XAUT_TICK_PUSH_MIN_MS 150
ulong g_lastTickPushMs = 0;

#define XAUT_BRIDGE_STATE_MIN_MS 1000
ulong g_lastBridgeStateMs = 0;

// Everything expensive (canvas repaint, ~30+ label object writes, the
// chart price-line objects, ChartRedraw()) used to fire from three
// independent, overlapping sources — OnTick, OnTimer's caret blink, and the
// position-scan timer — each calling Draw()/Render() on its own schedule.
// Stacked together that was several full redraws a second even at idle,
// which is real, avoidable overhead on top of whatever Wine itself costs.
// Now OnTick/OnTimer only ever update plain data (risk math, position scan
// — no chart objects touched); OnTimer's fixed 250ms tick is the *only*
// place that actually repaints, so the ceiling is a hard 4/sec no matter
// how fast the symbol ticks. Direct user actions (click/key/drag) still
// call RenderAll() immediately, so those stay instant.
STradePlan      g_lastPlan;
SRiskResult     g_lastResult;
SSymbolSnapshot g_lastSym;
SPositionInfo   g_lastPositions[];

#define XAUT_DATA_UPDATE_MIN_MS 150
ulong g_lastDataUpdateMs = 0;

#define XAUT_POSITION_SCAN_MIN_MS 1000
ulong g_lastPositionScanMs = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_currency = AccountInfoString(ACCOUNT_CURRENCY);
   g_orderMgr.Init(InpMagicNumber, InpDeviationPoints, "XAU-Trader");

#ifdef XAUT_LEGACY_PANEL
   CSettingsStore::Load(g_settings);
   g_lines.Init(ChartID());
   g_posLines.Init(ChartID());

   if(!g_panel.Create(ChartID(), g_settings))
     {
      Print("XAU Trader: failed to create the panel (", GetLastError(), ")");
      return(INIT_FAILED);
     }

   STradePlan plan;
   plan.Defaults();
   g_panel.SetPlan(plan);

   ChartSetInteger(ChartID(), CHART_EVENT_MOUSE_MOVE, true);
#endif

   EventSetMillisecondTimer(250);

   g_bridge.Init(InpBridgeHost, InpBridgePort);
   g_bridge.TryConnect(); // fine if this fails — the Launch Platform button (or OnTimer, if it's already up) picks it up

   g_launchBtn.Create(ChartID(), InpBridgeExePath, "http://127.0.0.1:" + IntegerToString(InpWebPort));

   g_ready = true;
   // Unconditional on attach/reinit (timeframe switch, template reload,
   // terminal restart...) so an already-open position is picked back up
   // immediately instead of only appearing on the next tick.
   ScanPositionsData();
   UpdateData();
   RenderAll();
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   ChartSetInteger(0, CHART_MOUSE_SCROLL, true); // never leave chart panning stuck off
   g_bridge.Disconnect();
   g_launchBtn.Destroy(ChartID());
#ifdef XAUT_LEGACY_PANEL
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
#endif
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(!g_ready) return;
   UpdateDataThrottled();
   ScanPositionsDataThrottled();
   PushBridgeTickThrottled();
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!g_ready) return;
#ifdef XAUT_LEGACY_PANEL
   g_panel.ToggleCaret();
   g_panel.ClearArmedState();
#endif
   UpdateDataThrottled();
   ScanPositionsDataThrottled();
#ifdef XAUT_LEGACY_PANEL
   FlushPendingPositionModify();
#endif
   RenderAll(); // the one place a full repaint actually happens — fixed 4/sec ceiling (legacy panel only; no-op otherwise)
   BridgeMaintain();
   g_launchBtn.Poll(ChartID(), g_bridge);
  }

//+------------------------------------------------------------------+
//| Always active regardless of XAUT_LEGACY_PANEL — the launch button   |
//| is the one on-chart control that exists either way. Legacy-panel    |
//| event handling (drag, settings, send/close) is appended below it    |
//| only when that flag is on.                                          |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(!g_ready) return;

   if(id == CHARTEVENT_OBJECT_CLICK && g_launchBtn.HandleClick(ChartID(), sparam, g_bridge))
      return;

#ifdef XAUT_LEGACY_PANEL
   OnChartEventLegacyPanel(id, lparam, dparam, sparam);
#endif
  }

#ifdef XAUT_LEGACY_PANEL
//+------------------------------------------------------------------+
//| Dragging a real position's SL/TP line fires OBJECT_DRAG on every    |
//| pixel of mouse movement, not just on release. Sending a real        |
//| modify request to the broker for each one would spam the server     |
//| and make the drag feel laggy, so only the *values* update           |
//| immediately (visually the line already moves natively); the actual  |
//| server call is throttled, with OnTimer guaranteeing the final       |
//| dragged value still gets flushed shortly after the user lets go.    |
//| (Web-driven position drags go through Bridge/Handlers.mqh's own,    |
//| equivalent 350ms coalescing instead — see CBridgeHandlers.)         |
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
void OnChartEventLegacyPanel(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
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

      return;
     }

   // The chart's own click-drag-to-pan/scroll and our panel's manual
   // dragging (header, slider, fields...) both listen to raw mouse
   // coordinates, so anything on the panel was also panning/scrolling the
   // chart underneath. CHART_MOUSE_SCROLL is MT5's own documented switch
   // for exactly this — off while the cursor is over the panel, on
   // everywhere else (including over the chart-native Entry/SL/TP and
   // position lines, which drag independently of this setting).
   if(id == CHARTEVENT_MOUSE_MOVE)
      ChartSetInteger(0, CHART_MOUSE_SCROLL, !g_panel.ContainsPoint((int)lparam, (int)dparam));

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
#endif // XAUT_LEGACY_PANEL

//+------------------------------------------------------------------+
void UpdateDataThrottled()
  {
   ulong now = GetTickCount64();
   if(now - g_lastDataUpdateMs < XAUT_DATA_UPDATE_MIN_MS)
      return;
   g_lastDataUpdateMs = now;
   UpdateData();
  }

//+------------------------------------------------------------------+
void ScanPositionsDataThrottled()
  {
   ulong now = GetTickCount64();
   if(now - g_lastPositionScanMs < XAUT_POSITION_SCAN_MIN_MS)
      return;
   g_lastPositionScanMs = now;
   ScanPositionsData();
  }

//+------------------------------------------------------------------+
void ScanPositionsData()
  {
   CPositionTracker::ScanSymbol(_Symbol, g_lastPositions);
#ifdef XAUT_LEGACY_PANEL
   g_panel.SetPositions(g_lastPositions);
#endif
  }

//+------------------------------------------------------------------+
//| Backward-compatible composite: update the position scan AND repaint |
//| immediately. Used by direct user actions (close button, drag) where  |
//| instant feedback matters — everything else goes through the plain    |
//| *Data()/Throttled() variants and waits for the next timer repaint.   |
//+------------------------------------------------------------------+
void ScanAndRenderPositions()
  {
   ScanPositionsData();
   RenderAll();
   // Instant feedback for the web mirror too — same reasoning as the native
   // repaint above: don't make a just-placed/closed trade wait out the
   // regular 1000ms bridge push throttle.
   if(g_bridge.IsConnected())
      g_bridge.SendLine(CProtocol::BuildPositions(g_lastPositions));
  }

//+------------------------------------------------------------------+
//| Re-reads the symbol/account snapshot, seeds a sensible SL/TP        |
//| default (until the user takes ownership of either), infers trade   |
//| direction from the SL/Entry relationship, and re-runs the risk      |
//| engine. Pure data — touches no chart object, so it's cheap enough   |
//| to call on every tick; RenderAll() is what actually paints it.      |
//+------------------------------------------------------------------+
void UpdateData()
  {
   // Always refreshed — the bridge's tick/symbol pushes need it regardless
   // of whether the legacy panel is active.
   g_lastSym = CSymbolInfoCache::Read(_Symbol);
#ifdef XAUT_LEGACY_PANEL
   STradePlan plan = g_panel.GetPlan();

   double refEntry = (plan.placement == PLACEMENT_MARKET) ? g_lastSym.ask
                      : (plan.entryPrice > 0.0 ? plan.entryPrice : g_lastSym.ask);

   // Pending orders have no typed price field anymore — the entry line is the
   // only way to set it, so it needs a live starting price the first time the
   // user switches to Limit/Stop, or there'd be nothing at price 0 to drag.
   if(plan.placement != PLACEMENT_MARKET && plan.entryPrice <= 0.0 && refEntry > 0.0)
      plan.entryPrice = refEntry;

   if(g_lastSym.valid && refEntry > 0.0)
     {
      if(!plan.slUserSet)
        {
         double defDist = refEntry * (XAUT_DEFAULT_STOP_PERCENT / 100.0);
         double minDist = (g_lastSym.stopsLevelPoints > 0) ? g_lastSym.stopsLevelPoints * g_lastSym.point * 1.5 : 0.0;
         defDist = MathMax(defDist, minDist);
         plan.slPrice = refEntry - defDist; // default bias: long, mirrors the BUY default direction
        }
      if(!plan.tpUserSet && plan.slPrice > 0.0)
        {
         double dist = MathAbs(refEntry - plan.slPrice);
         bool buyBias = (plan.slPrice < refEntry);
         plan.tpPrice = buyBias ? refEntry + plan.rrRatio * dist
                                 : refEntry - plan.rrRatio * dist;
        }
     }

   if(plan.slPrice > 0.0 && refEntry > 0.0)
      plan.direction = (plan.slPrice < refEntry) ? TRADE_DIR_BUY : TRADE_DIR_SELL;
   g_panel.SetPlan(plan);
   g_lastPlan = plan;

   g_lastResult = CRiskEngine::Evaluate(plan, g_lastSym);
   g_panel.UpdateMarket(g_lastResult, g_lastSym, g_currency);
#endif
  }

//+------------------------------------------------------------------+
//| Backward-compatible composite — see UpdateData()'s note.             |
//+------------------------------------------------------------------+
void Recompute()
  {
   UpdateData();
   RenderAll();
  }

//+------------------------------------------------------------------+
//| The one place that actually repaints: the panel canvas/labels, the   |
//| planning Entry/SL/TP lines, and every open position's SL/TP lines,   |
//| all from whatever UpdateData()/ScanPositionsData() last computed.    |
//| No-op when the legacy panel is disabled — the web dashboard is its   |
//| own, independently-rendered front end.                               |
//+------------------------------------------------------------------+
void RenderAll()
  {
#ifdef XAUT_LEGACY_PANEL
   g_panel.Draw();

   SPalette pal = CTheme::Get(g_panel.GetSettings().theme);

   // Planning Entry/SL/TP lines stay off the chart until the user actually
   // starts configuring a trade — no clutter on attach/after a fresh reset.
   if(g_panel.IsReviewing())
     {
      bool marketMode = (g_lastPlan.placement == PLACEMENT_MARKET);
      double lineEntry = marketMode ? ((g_lastPlan.direction == TRADE_DIR_BUY) ? g_lastSym.ask : g_lastSym.bid) : g_lastPlan.entryPrice;

      g_lines.Render(pal, g_panel.GetSettings().lang, g_currency,
                     lineEntry, g_lastPlan.slPrice, g_lastPlan.tpPrice,
                     !marketMode, g_lastSym.valid ? g_lastSym.digits : _Digits,
                     g_lastResult.riskMoney, g_lastResult.rewardMoney);
     }
   else
      g_lines.Clear();

   g_posLines.Render(g_lastPositions, pal, g_panel.GetSettings().lang, g_currency,
                      g_lastSym.valid ? g_lastSym.digits : _Digits);
#endif
  }

#ifdef XAUT_LEGACY_PANEL
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
   fresh.rrRatio = plan.rrRatio;
   g_panel.SetPlan(fresh);

   ScanAndRenderPositions();
   Recompute();
  }
#endif // XAUT_LEGACY_PANEL

//+------------------------------------------------------------------+
//| Web-platform bridge — the primary front door. hello/tick/account/   |
//| symbol/positions out; bars.request/risk.preview/order.* in, wired    |
//| into the unchanged CRiskEngine/COrderManager via Bridge/Handlers.mqh.|
//+------------------------------------------------------------------+
void BridgeMaintain()
  {
   g_bridge.TryConnect();

   bool connected = g_bridge.IsConnected();
   if(connected && !g_bridgeWasConnected)
      SendBridgeHello();
   g_bridgeWasConnected = connected;

   if(!connected)
      return;

   PushBridgeStateThrottled();
   g_bridgeHandlers.PushBarUpdate(g_bridge);

   bool positionsChanged = false;
   string lines[];
   int count = g_bridge.PollLines(lines);
   for(int i = 0; i < count; i++)
      if(g_bridgeHandlers.Dispatch(g_bridge, g_orderMgr, _Symbol, lines[i]))
         positionsChanged = true;

   if(g_bridgeHandlers.FlushPendingModify(g_bridge, g_orderMgr, _Symbol))
      positionsChanged = true;

   if(positionsChanged)
      ScanAndRenderPositions();
  }

void SendBridgeHello()
  {
   long account = AccountInfoInteger(ACCOUNT_LOGIN);
   string broker = AccountInfoString(ACCOUNT_COMPANY);
   g_bridge.SendLine(CProtocol::BuildHello(account, broker, _Symbol, (long)InpMagicNumber, XAUT_EA_VERSION));
  }

void PushBridgeTickThrottled()
  {
   if(!g_bridge.IsConnected() || !g_lastSym.valid)
      return;
   ulong now = GetTickCount64();
   if(now - g_lastTickPushMs < XAUT_TICK_PUSH_MIN_MS)
      return;
   g_lastTickPushMs = now;
   g_bridge.SendLine(CProtocol::BuildTick(_Symbol, g_lastSym.bid, g_lastSym.ask, TimeCurrent()));
  }

void PushBridgeStateThrottled()
  {
   ulong now = GetTickCount64();
   if(now - g_lastBridgeStateMs < XAUT_BRIDGE_STATE_MIN_MS)
      return;
   g_lastBridgeStateMs = now;

   if(g_lastSym.valid)
      g_bridge.SendLine(CProtocol::BuildSymbol(g_lastSym));

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   g_bridge.SendLine(CProtocol::BuildAccount(balance, equity, freeMargin, g_currency));

   g_bridge.SendLine(CProtocol::BuildPositions(g_lastPositions));

   g_bridgeHandlers.PushNewDeals(g_bridge, _Symbol);
  }
//+------------------------------------------------------------------+
