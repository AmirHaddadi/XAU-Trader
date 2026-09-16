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
#include <XAUTrader/Chart/LevelLines.mqh>
#include <XAUTrader/GUI/Theme.mqh>
#include <XAUTrader/GUI/Panel.mqh>
#include <XAUTrader/Config/SettingsStore.mqh>

input ulong  InpMagicNumber       = 574839201;  // Magic number for orders placed by this panel
input int    InpDeviationPoints   = 20;         // Max price deviation (points) for market orders

CPanel          g_panel;
COrderManager   g_orderMgr;
CLevelLines     g_lines;
SAppSettings    g_settings;
string          g_currency;
bool            g_ready = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   CSettingsStore::Load(g_settings);
   g_currency = AccountInfoString(ACCOUNT_CURRENCY);

   g_lines.Init(ChartID());
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
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   if(!g_ready) return;
   Recompute();
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!g_ready) return;
   g_panel.ToggleCaret();
   g_panel.ClearArmedState();
   Recompute();
  }

//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(!g_ready) return;

   if(id == CHARTEVENT_OBJECT_DRAG)
     {
      double price = 0.0;
      string which = g_lines.DraggedLevel(sparam, price);
      if(which != "")
        {
         STradePlan plan = g_panel.GetPlan();
         SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
         if(sym.valid)
            price = NormalizeDouble(price, sym.digits);
         if(which == "entry") plan.entryPrice = price;
         else if(which == "sl") plan.slPrice = price;
         else if(which == "tp") plan.tpPrice = price;
         g_panel.SetPlan(plan);
         Recompute();
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

      default:
         break;
     }
  }

//+------------------------------------------------------------------+
//| Re-reads the symbol/account snapshot, infers trade direction      |
//| from the SL/Entry relationship, re-runs the risk engine and       |
//| pushes the result into both the panel and the chart level lines.  |
//+------------------------------------------------------------------+
void Recompute()
  {
   SSymbolSnapshot sym = CSymbolInfoCache::Read(_Symbol);
   STradePlan plan = g_panel.GetPlan();

   double refEntry = (plan.placement == PLACEMENT_MARKET) ? sym.ask : plan.entryPrice;
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
      Print("XAU Trader: order failed — ", msg);
   else
      Print("XAU Trader: order placed, ticket=", ticket);

   Recompute();
  }
//+------------------------------------------------------------------+
