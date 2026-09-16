//+------------------------------------------------------------------+
//|                                               PositionLines.mqh   |
//|   XAU-Trader — draggable SL/TP lines for each REAL open position   |
//|   on the symbol (as opposed to LevelLines, which previews an      |
//|   unsent plan). Ticket-scoped object names so any number of open  |
//|   positions (hedging accounts) each get their own pair of lines,  |
//|   and lines for a ticket that's no longer open are cleaned up.    |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"
#include "../Core/Types.mqh"
#include "../GUI/Theme.mqh"
#include "../GUI/Localization.mqh"

#define XAUT_POS_PREFIX (XAUT_OBJ_PREFIX + "POS_")

class CPositionLines
  {
private:
   long   m_chartId;
   ulong  m_lastTickets[];

   string NameSL(const ulong ticket) { return XAUT_POS_PREFIX + IntegerToString(ticket) + "_SL"; }
   string NameTP(const ulong ticket) { return XAUT_POS_PREFIX + IntegerToString(ticket) + "_TP"; }
   string NameLblSL(const ulong ticket) { return XAUT_POS_PREFIX + IntegerToString(ticket) + "_LBLSL"; }
   string NameLblTP(const ulong ticket) { return XAUT_POS_PREFIX + IntegerToString(ticket) + "_LBLTP"; }

   void UpsertLine(const string name, const double price, const color clr)
     {
      if(price <= 0.0)
        {
         if(ObjectFind(m_chartId, name) >= 0) ObjectDelete(m_chartId, name);
         return;
        }
      if(ObjectFind(m_chartId, name) < 0)
         ObjectCreate(m_chartId, name, OBJ_HLINE, 0, 0, price);
      else
         ObjectSetDouble(m_chartId, name, OBJPROP_PRICE, price);
      ObjectSetInteger(m_chartId, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(m_chartId, name, OBJPROP_STYLE, STYLE_SOLID);
      ObjectSetInteger(m_chartId, name, OBJPROP_WIDTH, 2);
      ObjectSetInteger(m_chartId, name, OBJPROP_BACK, false);
      ObjectSetInteger(m_chartId, name, OBJPROP_SELECTABLE, true);
      ObjectSetInteger(m_chartId, name, OBJPROP_SELECTED, false);
      ObjectSetInteger(m_chartId, name, OBJPROP_HIDDEN, true);
     }

   void UpsertLabel(const string name, const double price, const string text, const color clr)
     {
      if(price <= 0.0 || text == "")
        {
         if(ObjectFind(m_chartId, name) >= 0) ObjectDelete(m_chartId, name);
         return;
        }
      int rightBar = MathMax((int)ChartGetInteger(m_chartId, CHART_FIRST_VISIBLE_BAR), 2);
      datetime t = iTime(ChartSymbol(m_chartId), (ENUM_TIMEFRAMES)ChartPeriod(m_chartId), rightBar - 2);
      if(t <= 0) t = TimeCurrent();

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
      ObjectSetInteger(m_chartId, name, OBJPROP_HIDDEN, true);
     }

   void DeleteForTicket(const ulong ticket)
     {
      string names[4] = { NameSL(ticket), NameTP(ticket), NameLblSL(ticket), NameLblTP(ticket) };
      for(int i = 0; i < 4; i++)
         if(ObjectFind(m_chartId, names[i]) >= 0)
            ObjectDelete(m_chartId, names[i]);
     }

   bool WasTracked(const ulong ticket)
     {
      for(int i = 0; i < ArraySize(m_lastTickets); i++)
         if(m_lastTickets[i] == ticket)
            return true;
      return false;
     }

public:
   void Init(const long chartId) { m_chartId = chartId; }

   void Render(const SPositionInfo &positions[], const SPalette &pal, const ENUM_APP_LANG lang, const string currency, const int digits)
     {
      ulong nowTickets[];
      ArrayResize(nowTickets, ArraySize(positions));

      for(int i = 0; i < ArraySize(positions); i++)
        {
         ulong tk = positions[i].ticket;
         nowTickets[i] = tk;
         bool isBuy = (positions[i].type == POSITION_TYPE_BUY);
         color slClr = pal.sell;
         color tpClr = pal.buy;

         UpsertLine(NameSL(tk), positions[i].sl, slClr);
         UpsertLine(NameTP(tk), positions[i].tp, tpClr);

         string slTxt = positions[i].sl > 0.0 ? ("#" + IntegerToString((int)(tk % 100000)) + " " + CLocalization::Get(TXT_SL, lang) + " " + DoubleToString(positions[i].sl, digits)) : "";
         string tpTxt = positions[i].tp > 0.0 ? ("#" + IntegerToString((int)(tk % 100000)) + " " + CLocalization::Get(TXT_TP, lang) + " " + DoubleToString(positions[i].tp, digits)) : "";
         UpsertLabel(NameLblSL(tk), positions[i].sl, slTxt, slClr);
         UpsertLabel(NameLblTP(tk), positions[i].tp, tpTxt, tpClr);
        }

      // Drop lines for tickets that were tracked before but are gone now
      // (closed manually, by SL/TP, or via the panel).
      for(int i = 0; i < ArraySize(m_lastTickets); i++)
        {
         ulong tk = m_lastTickets[i];
         bool stillOpen = false;
         for(int j = 0; j < ArraySize(nowTickets); j++)
            if(nowTickets[j] == tk) { stillOpen = true; break; }
         if(!stillOpen)
            DeleteForTicket(tk);
        }

      ArrayFree(m_lastTickets);
      ArrayResize(m_lastTickets, ArraySize(nowTickets));
      for(int i = 0; i < ArraySize(nowTickets); i++)
         m_lastTickets[i] = nowTickets[i];
     }

   void Clear()
     {
      for(int i = 0; i < ArraySize(m_lastTickets); i++)
         DeleteForTicket(m_lastTickets[i]);
      ArrayFree(m_lastTickets);
     }

   //--- Returns the ticket + "sl"/"tp" for a dragged object, or ticket=0 if
   //--- the name doesn't belong to us.
   string DraggedLevel(const string objName, ulong &outTicket, double &outPrice)
     {
      outTicket = 0;
      if(StringFind(objName, XAUT_POS_PREFIX) != 0)
         return "";
      string rest = StringSubstr(objName, StringLen(XAUT_POS_PREFIX));
      int us = StringFind(rest, "_");
      if(us < 0) return "";
      string tkStr = StringSubstr(rest, 0, us);
      string kind  = StringSubstr(rest, us + 1);
      if(kind != "SL" && kind != "TP") return ""; // labels aren't draggable
      outTicket = StringToInteger(tkStr);
      outPrice = ObjectGetDouble(m_chartId, objName, OBJPROP_PRICE);
      return (kind == "SL") ? "sl" : "tp";
     }
  };
//+------------------------------------------------------------------+
