//+------------------------------------------------------------------+
//|                                                  LevelLines.mqh   |
//|   XAU-Trader — draggable Entry/SL/TP price lines drawn live on    |
//|   the chart, kept in sync with the panel in both directions.      |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"
#include "../GUI/Theme.mqh"
#include "../GUI/Localization.mqh"

#define XAUT_LN_ENTRY   (XAUT_OBJ_PREFIX + "LN_ENTRY")
#define XAUT_LN_SL      (XAUT_OBJ_PREFIX + "LN_SL")
#define XAUT_LN_TP      (XAUT_OBJ_PREFIX + "LN_TP")
#define XAUT_LB_ENTRY   (XAUT_OBJ_PREFIX + "LB_ENTRY")
#define XAUT_LB_SL      (XAUT_OBJ_PREFIX + "LB_SL")
#define XAUT_LB_TP      (XAUT_OBJ_PREFIX + "LB_TP")

class CLevelLines
  {
private:
   long m_chartId;

   void UpsertLine(const string name, const double price, const color clr, const bool draggable)
     {
      if(price <= 0.0)
        {
         if(ObjectFind(m_chartId, name) >= 0)
            ObjectDelete(m_chartId, name);
         return;
        }
      if(ObjectFind(m_chartId, name) < 0)
         ObjectCreate(m_chartId, name, OBJ_HLINE, 0, 0, price);
      else
         ObjectSetDouble(m_chartId, name, OBJPROP_PRICE, price);

      ObjectSetInteger(m_chartId, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(m_chartId, name, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(m_chartId, name, OBJPROP_WIDTH, 1);
      // Background layer — the only mechanism MT5 actually guarantees for
      // stacking order (unlike OBJPROP_ZORDER, which only affects click
      // priority, not what's drawn on top). The panel bitmap stays
      // foreground, so it's always painted after/above these.
      ObjectSetInteger(m_chartId, name, OBJPROP_BACK, true);
      ObjectSetInteger(m_chartId, name, OBJPROP_SELECTABLE, draggable);
      ObjectSetInteger(m_chartId, name, OBJPROP_SELECTED, false);
      ObjectSetInteger(m_chartId, name, OBJPROP_HIDDEN, true); // keep it out of the object list clutter
     }

   //--- Anchored to the right-most visible bar so it always stays in view
   //--- while the user scrolls/zooms, without drifting into empty space.
   void UpsertLabel(const string name, const double price, const string text, const color clr)
     {
      if(price <= 0.0 || text == "")
        {
         if(ObjectFind(m_chartId, name) >= 0)
            ObjectDelete(m_chartId, name);
         return;
        }
      int rightBar = (int)ChartGetInteger(m_chartId, CHART_FIRST_VISIBLE_BAR);
      rightBar = MathMax(rightBar, 2);
      datetime t = iTime(ChartSymbol(m_chartId), (ENUM_TIMEFRAMES)ChartPeriod(m_chartId), rightBar - 2);
      if(t <= 0)
         t = TimeCurrent();

      if(ObjectFind(m_chartId, name) < 0)
         ObjectCreate(m_chartId, name, OBJ_TEXT, 0, t, price);
      else
        {
         ObjectSetInteger(m_chartId, name, OBJPROP_TIME, t);
         ObjectSetDouble(m_chartId, name, OBJPROP_PRICE, price);
        }
      ObjectSetString(m_chartId, name, OBJPROP_TEXT, "  " + text);
      ObjectSetInteger(m_chartId, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(m_chartId, name, OBJPROP_ANCHOR, ANCHOR_LEFT);
      ObjectSetInteger(m_chartId, name, OBJPROP_FONTSIZE, 8);
      ObjectSetString(m_chartId, name, OBJPROP_FONT, "Arial");
      ObjectSetInteger(m_chartId, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(m_chartId, name, OBJPROP_BACK, true);
      ObjectSetInteger(m_chartId, name, OBJPROP_HIDDEN, true);
     }

public:
   void Init(const long chartId) { m_chartId = chartId; }

   //--- entryDraggable is false for PLACEMENT_MARKET (the line is a live
   //--- read-only marker following price, not an editable plan input).
   void Render(const SPalette &pal, const ENUM_APP_LANG lang, const string currency,
               const double entry, const double sl, const double tp,
               const bool entryDraggable, const int digits,
               const double riskMoney, const double rewardMoney)
     {
      UpsertLine(XAUT_LN_ENTRY, entry, pal.accentGold, entryDraggable);
      UpsertLine(XAUT_LN_SL,    sl,    pal.sell,        sl > 0.0);
      UpsertLine(XAUT_LN_TP,    tp,    pal.buy,         tp > 0.0);

      string entryTxt = entry > 0.0 ? (CLocalization::Get(TXT_ENTRY, lang) + " " + DoubleToString(entry, digits)) : "";
      string slTxt = sl > 0.0 ? (CLocalization::Get(TXT_SL, lang) + " " + DoubleToString(sl, digits) +
                                  (riskMoney > 0.0 ? "  -" + DoubleToString(riskMoney, 2) : "")) : "";
      string tpTxt = tp > 0.0 ? (CLocalization::Get(TXT_TP, lang) + " " + DoubleToString(tp, digits) +
                                  (rewardMoney > 0.0 ? "  +" + DoubleToString(rewardMoney, 2) : "")) : "";

      UpsertLabel(XAUT_LB_ENTRY, entry, entryTxt, pal.accentGold);
      UpsertLabel(XAUT_LB_SL,    sl,    slTxt,    pal.sell);
      UpsertLabel(XAUT_LB_TP,    tp,    tpTxt,    pal.buy);
     }

   void RepositionLabels()
     {
      // Re-anchor existing labels to the (possibly scrolled) right edge without changing price.
      if(ObjectFind(m_chartId, XAUT_LB_ENTRY) >= 0) TouchLabel(XAUT_LB_ENTRY);
      if(ObjectFind(m_chartId, XAUT_LB_SL) >= 0)    TouchLabel(XAUT_LB_SL);
      if(ObjectFind(m_chartId, XAUT_LB_TP) >= 0)    TouchLabel(XAUT_LB_TP);
     }

   void Clear()
     {
      ObjectDelete(m_chartId, XAUT_LN_ENTRY);
      ObjectDelete(m_chartId, XAUT_LN_SL);
      ObjectDelete(m_chartId, XAUT_LN_TP);
      ObjectDelete(m_chartId, XAUT_LB_ENTRY);
      ObjectDelete(m_chartId, XAUT_LB_SL);
      ObjectDelete(m_chartId, XAUT_LB_TP);
     }

   //--- Reads back a dragged line's new price. Returns "" if name isn't one of ours.
   string DraggedLevel(const string objName, double &outPrice)
     {
      if(objName != XAUT_LN_ENTRY && objName != XAUT_LN_SL && objName != XAUT_LN_TP)
         return "";
      outPrice = ObjectGetDouble(m_chartId, objName, OBJPROP_PRICE);
      if(objName == XAUT_LN_ENTRY) return "entry";
      if(objName == XAUT_LN_SL)    return "sl";
      return "tp";
     }

private:
   void TouchLabel(const string name)
     {
      double price = ObjectGetDouble(m_chartId, name, OBJPROP_PRICE);
      string text   = ObjectGetString(m_chartId, name, OBJPROP_TEXT);
      color  clr    = (color)ObjectGetInteger(m_chartId, name, OBJPROP_COLOR);
      UpsertLabel(name, price, text, clr);
     }
  };
//+------------------------------------------------------------------+
