//+------------------------------------------------------------------+
//|                                                        Panel.mqh  |
//|   XAU-Trader — the native, canvas-drawn, draggable trading panel. |
//|   Owns its own visual state; the EA feeds it data and forwards    |
//|   chart events, and reacts to the ENUM_PANEL_ACTION it returns.   |
//+------------------------------------------------------------------+
#property strict
#include <Canvas/Canvas.mqh>
#include "../Core/Defines.mqh"
#include "../Core/Types.mqh"
#include "../Core/Utils.mqh"
#include "Theme.mqh"
#include "Localization.mqh"
#include "PanelLayout.mqh"

enum ENUM_PANEL_ACTION
  {
   PANEL_ACTION_NONE = 0,
   PANEL_ACTION_REDRAW_LINES,
   PANEL_ACTION_SETTINGS_CHANGED,
   PANEL_ACTION_SEND_BUY,
   PANEL_ACTION_SEND_SELL,
   PANEL_ACTION_CLOSE_REQUESTED
  };

#define XAUT_PANEL_OBJ (XAUT_OBJ_PREFIX + "PANEL_BMP")
#define XAUT_ARM_SECONDS 3

// Virtual-key codes used for the numeric field editor (not predefined by MQL5)
#define XAUT_VK_BACK        0x08
#define XAUT_VK_RETURN      0x0D
#define XAUT_VK_ESCAPE      0x1B
#define XAUT_VK_DECIMAL     0x6E
#define XAUT_VK_NUMPAD0     0x60
#define XAUT_VK_NUMPAD9     0x69
#define XAUT_VK_OEM_PERIOD  0xBE

class CPanel
  {
private:
   long           m_chartId;
   CCanvas        m_canvas;
   bool           m_created;

   SAppSettings   m_settings;
   STradePlan     m_plan;
   SRiskResult    m_result;
   SSymbolSnapshot m_sym;
   string         m_currency;
   SPanelRects    m_rc;

   bool           m_settingsOpen;
   string         m_focusField;     // "", "risk", "entry", "sl", "tp"
   string         m_editBuffer;
   bool           m_caretOn;

   bool           m_dragPanel;
   int            m_dragDX, m_dragDY;
   bool           m_dragSlider;

   datetime       m_armBuyUntil;
   datetime       m_armSellUntil;

   //--- ---------------------------------------------------------- drawing
   void DrawIconGear(const int cx, const int cy, const int r, const color clr)
     {
      m_canvas.Circle(cx, cy, r, clr);
      m_canvas.Circle(cx, cy, (int)MathRound(r * 0.42), clr);
      for(int i = 0; i < 8; i++)
        {
         double a = i * (2 * M_PI / 8.0);
         int x1 = cx + (int)MathRound(MathCos(a) * r);
         int y1 = cy + (int)MathRound(MathSin(a) * r);
         int x2 = cx + (int)MathRound(MathCos(a) * (r + 3));
         int y2 = cy + (int)MathRound(MathSin(a) * (r + 3));
         m_canvas.Line(x1, y1, x2, y2, clr);
        }
     }

   void DrawIconTheme(const int cx, const int cy, const int r, const bool dark, const color clr)
     {
      if(!dark)
        {
         m_canvas.Circle(cx, cy, r, clr);
         for(int i = 0; i < 8; i++)
           {
            double a = i * (2 * M_PI / 8.0);
            int x1 = cx + (int)MathRound(MathCos(a) * (r + 2));
            int y1 = cy + (int)MathRound(MathSin(a) * (r + 2));
            int x2 = cx + (int)MathRound(MathCos(a) * (r + 5));
            int y2 = cy + (int)MathRound(MathSin(a) * (r + 5));
            m_canvas.Line(x1, y1, x2, y2, clr);
           }
        }
      else
        {
         m_canvas.FillCircle(cx, cy, r, clr);
        }
     }

   void DrawIconMinimize(const int cx, const int cy, const int half, const color clr)
     {
      m_canvas.Line(cx - half, cy, cx + half, cy, clr);
     }

   void DrawIconClose(const int cx, const int cy, const int half, const color clr)
     {
      m_canvas.Line(cx - half, cy - half, cx + half, cy + half, clr);
      m_canvas.Line(cx - half, cy + half, cx + half, cy - half, clr);
     }

   void FillRect(const SRect &r, const color clr, const uchar alpha = 255)
     {
      m_canvas.FillRectangle(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, ColorToARGB(clr, alpha));
     }

   void StrokeRect(const SRect &r, const color clr, const uchar alpha = 255)
     {
      m_canvas.Rectangle(r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, ColorToARGB(clr, alpha));
     }

   // If the embedded custom font ever fails to resolve by name, fall back to a
   // guaranteed system font rather than silently drawing nothing (which is
   // exactly the failure mode that shipped once already).
   void Text(const int x, const int y, const string s, const color clr, const uint align, const bool bold = false)
     {
      int size = (int)MathRound(-11 * m_settings.uiScale);
      if(!m_canvas.FontSet("MiSans", size, FW_NORMAL))
         m_canvas.FontSet("Arial", size, FW_NORMAL);
      m_canvas.TextOut(x, y, s, ColorToARGB(clr, 255), align);
     }

   void TextFa(const int x, const int y, const string s, const color clr, const uint align)
     {
      int size = (int)MathRound(-12 * m_settings.uiScale);
      if(!m_canvas.FontSet("Vazir", size, FW_NORMAL))
         m_canvas.FontSet("Tahoma", size, FW_NORMAL);
      m_canvas.TextOut(x, y, s, ColorToARGB(clr, 255), align);
     }

   string L(const ENUM_TXT id) { return CLocalization::Get(id, m_settings.lang); }
   bool   RTL() { return CLocalization::IsRTL(m_settings.lang); }

   void DrawLabel(const int x, const int y, const string s, const color clr, const bool leftAlign)
     {
      uint align = leftAlign ? (TA_LEFT | TA_TOP) : (TA_RIGHT | TA_TOP);
      if(RTL())
         TextFa(x, y, s, clr, align);
      else
         Text(x, y, s, clr, align);
     }

   void DrawCentered(const SRect &r, const string s, const color clr)
     {
      int cx = r.x + r.w / 2;
      int cy = r.y + r.h / 2;
      if(RTL())
         TextFa(cx, cy, s, clr, TA_CENTER | TA_VCENTER);
      else
         Text(cx, cy, s, clr, TA_CENTER | TA_VCENTER);
     }

   void DrawSegment(const SRect &r, const string label, const bool active, const SPalette &pal)
     {
      FillRect(r, active ? pal.accentGold : pal.cardAlt);
      StrokeRect(r, pal.border);
      DrawCentered(r, label, active ? pal.header : pal.textMuted);
     }

   void DrawField(const SRect &r, const string label, const string value, const bool focused,
                   const bool disabled, const SPalette &pal, const string placeholder = "")
     {
      FillRect(r, pal.cardAlt);
      StrokeRect(r, focused ? pal.accentGold : pal.border);
      int pad = (int)MathRound(8 * m_settings.uiScale);
      bool rtl = RTL();
      int labelX = rtl ? r.x + r.w - pad : r.x + pad;
      int valueX = rtl ? r.x + pad : r.x + r.w - pad;
      uint labelAlign = (rtl ? TA_RIGHT : TA_LEFT) | TA_VCENTER;
      uint valueAlign = (rtl ? TA_LEFT : TA_RIGHT) | TA_VCENTER;
      int cy = r.y + r.h / 2;

      color lblClr = disabled ? pal.textMuted : pal.textMuted;
      if(rtl) TextFa(labelX, cy, label, lblClr, labelAlign); else Text(labelX, cy, label, lblClr, labelAlign);

      string shown = value;
      color valClr = disabled ? pal.textMuted : pal.textPrimary;
      if(value == "" && placeholder != "")
        {
         shown = placeholder;
         valClr = pal.textMuted;
        }
      if(focused)
         shown = shown + (m_caretOn ? "|" : "");
      if(rtl) TextFa(valueX, cy, shown, valClr, valueAlign); else Text(valueX, cy, shown, valClr, valueAlign);
     }

public:
   CPanel() { m_created = false; m_settingsOpen = false; m_focusField = ""; m_dragPanel = false; m_dragSlider = false; m_caretOn = true; m_armBuyUntil = 0; m_armSellUntil = 0; }

   bool Create(const long chartId, const SAppSettings &settings)
     {
      m_chartId = chartId;
      m_settings = settings;
      m_rc = SPanelRects::Build(m_settings.uiScale, m_settings.collapsed);

      // NORMALIZE (not RAW) is required for the library to correctly alpha-blend
      // both filled shapes and anti-aliased text against the chart behind it —
      // RAW left the panel translucent and every glyph invisible.
      if(!m_canvas.CreateBitmapLabel(m_chartId, 0, XAUT_PANEL_OBJ, m_settings.panelX, m_settings.panelY,
                                       m_rc.scaleW, m_rc.scaleH, COLOR_FORMAT_ARGB_NORMALIZE))
         return false;

      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_XDISTANCE, m_settings.panelX);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_YDISTANCE, m_settings.panelY);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_HIDDEN, true);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_BACK, false);

      m_plan.Defaults();
      m_result.Reset();
      m_created = true;
      Draw();
      return true;
     }

   void Destroy()
     {
      if(!m_created) return;
      m_canvas.Destroy();
      if(ObjectFind(m_chartId, XAUT_PANEL_OBJ) >= 0)
         ObjectDelete(m_chartId, XAUT_PANEL_OBJ);
      m_created = false;
     }

   bool IsCreated() const { return m_created; }
   STradePlan     GetPlan()     const { return m_plan; }
   SAppSettings   GetSettings() const { return m_settings; }
   SRiskResult    GetResult()   const { return m_result; }

   void SetPlan(const STradePlan &p) { m_plan = p; }

   void UpdateMarket(const SRiskResult &res, const SSymbolSnapshot &sym, const string currency)
     {
      m_result = res;
      m_sym = sym;
      m_currency = currency;
     }

   void ToggleCaret() { m_caretOn = !m_caretOn; }

   //--- Rebuilds the geometry cache (call after scale/collapse changes) and repositions the bitmap.
   void ApplySettingsGeometry()
     {
      m_rc = SPanelRects::Build(m_settings.uiScale, m_settings.collapsed);
      m_canvas.Resize(m_rc.scaleW, m_rc.scaleH);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_XSIZE, m_rc.scaleW);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_YSIZE, m_rc.scaleH);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_XDISTANCE, m_settings.panelX);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_YDISTANCE, m_settings.panelY);
     }

   void Draw()
     {
      if(!m_created) return;
      SPalette pal = CTheme::Get(m_settings.theme);
      m_canvas.Erase(ColorToARGB(clrBlack, 0));

      SRect full; full.x = 0; full.y = 0; full.w = m_rc.scaleW; full.h = m_rc.scaleH;
      FillRect(full, pal.card, 250);
      StrokeRect(full, pal.border, 250);

      FillRect(m_rc.header, pal.header);
      int hcy = m_rc.header.y + m_rc.header.h / 2;
      int titleX = RTL() ? m_rc.header.x + m_rc.header.w - (int)(12 * m_settings.uiScale) : m_rc.header.x + (int)(12 * m_settings.uiScale);
      uint titleAlign = (RTL() ? TA_RIGHT : TA_LEFT) | TA_VCENTER;
      if(RTL()) TextFa(titleX, hcy, L(TXT_APP_TITLE), CTheme::HeaderText(), titleAlign);
      else       Text(titleX, hcy, L(TXT_APP_TITLE), CTheme::HeaderText(), titleAlign);

      DrawIconGear(m_rc.btnSettings.x + m_rc.btnSettings.w / 2, hcy, (int)(6 * m_settings.uiScale), CTheme::HeaderText());
      DrawIconTheme(m_rc.btnTheme.x + m_rc.btnTheme.w / 2, hcy, (int)(6 * m_settings.uiScale), m_settings.theme == THEME_DARK, CTheme::HeaderText());
      DrawIconMinimize(m_rc.btnMinimize.x + m_rc.btnMinimize.w / 2, hcy, (int)(6 * m_settings.uiScale), CTheme::HeaderText());
      DrawIconClose(m_rc.btnClose.x + m_rc.btnClose.w / 2, hcy, (int)(5 * m_settings.uiScale), CTheme::HeaderText());

      if(m_settings.collapsed)
        {
         m_canvas.Update();
         return;
        }

      if(m_settingsOpen)
         DrawSettingsBody(pal);
      else
         DrawTradingBody(pal);

      m_canvas.Update();
     }

private:
   void DrawSettingsBody(const SPalette &pal)
     {
      DrawSegment(m_rc.setThemeDark,  L(TXT_THEME_DARK),  m_settings.theme == THEME_DARK,  pal);
      DrawSegment(m_rc.setThemeLight, L(TXT_THEME_LIGHT), m_settings.theme == THEME_LIGHT, pal);

      DrawSegment(m_rc.setLangFa, "فارسی", m_settings.lang == LANG_FA, pal);
      DrawSegment(m_rc.setLangEn, "English", m_settings.lang == LANG_EN, pal);

      DrawLabel(m_rc.setScaleMinus.x, m_rc.setScaleMinus.y - (int)(16 * m_settings.uiScale), L(TXT_FONT_SCALE), pal.textMuted, !RTL());
      DrawCentered(m_rc.setScaleMinus, "-", pal.textPrimary);
      DrawCentered(m_rc.setScalePlus, "+", pal.textPrimary);
      FillRect(m_rc.setScaleTrack, pal.cardAlt);
      double t = (m_settings.uiScale - XAUT_PANEL_MIN_SCALE) / (XAUT_PANEL_MAX_SCALE - XAUT_PANEL_MIN_SCALE);
      SRect thumb = m_rc.setScaleTrack;
      thumb.x = m_rc.setScaleTrack.x + (int)MathRound(t * m_rc.setScaleTrack.w) - 3;
      thumb.w = 6; thumb.h = 14; thumb.y -= 5;
      FillRect(thumb, pal.accentGold);

      DrawSegment(m_rc.setBack, L(TXT_SAVE), true, pal);
     }

   void DrawTradingBody(const SPalette &pal)
     {
      DrawSegment(m_rc.tabRiskPct,    L(TXT_RISK_PCT_BALANCE), m_plan.riskMode == RISK_MODE_PERCENT_BALANCE, pal);
      DrawSegment(m_rc.tabRiskEquity, L(TXT_RISK_PCT_EQUITY),  m_plan.riskMode == RISK_MODE_PERCENT_EQUITY,  pal);
      DrawSegment(m_rc.tabRiskFixed,  L(TXT_RISK_FIXED_MONEY), m_plan.riskMode == RISK_MODE_FIXED_MONEY,     pal);

      string riskVal = (m_focusField == "risk") ? m_editBuffer : FormatRisk();
      DrawField(m_rc.fieldRiskValue, L(TXT_RISK_VALUE), riskVal, m_focusField == "risk", false, pal);

      FillRect(m_rc.sliderRisk, pal.cardAlt);
      double lo, hi; RiskSliderRange(lo, hi);
      double t = (hi > lo) ? (m_plan.riskValue - lo) / (hi - lo) : 0.0;
      t = MathMax(0.0, MathMin(1.0, t));
      SRect thumb = m_rc.sliderRisk;
      thumb.x = m_rc.sliderRisk.x + (int)MathRound(t * m_rc.sliderRisk.w) - 3;
      thumb.w = 6; thumb.h = m_rc.sliderRisk.h + 6; thumb.y -= 3;
      FillRect(thumb, pal.accentGold);

      DrawSegment(m_rc.tabMarket, L(TXT_PLACEMENT_MARKET), m_plan.placement == PLACEMENT_MARKET, pal);
      DrawSegment(m_rc.tabLimit,  L(TXT_PLACEMENT_LIMIT),  m_plan.placement == PLACEMENT_LIMIT,  pal);
      DrawSegment(m_rc.tabStop,   L(TXT_PLACEMENT_STOP),   m_plan.placement == PLACEMENT_STOP,   pal);

      bool marketMode = (m_plan.placement == PLACEMENT_MARKET);
      string entryShown = marketMode ? DoubleToString((m_plan.direction == TRADE_DIR_BUY) ? m_sym.ask : m_sym.bid, m_sym.digits)
                                       : ((m_focusField == "entry") ? m_editBuffer : (m_plan.entryPrice > 0 ? DoubleToString(m_plan.entryPrice, m_sym.digits) : ""));
      DrawField(m_rc.fieldEntry, L(TXT_ENTRY), entryShown, m_focusField == "entry", marketMode, pal, marketMode ? "" : "—");

      string slShown = (m_focusField == "sl") ? m_editBuffer : (m_plan.slPrice > 0 ? DoubleToString(m_plan.slPrice, m_sym.digits) : "");
      DrawField(m_rc.fieldSL, L(TXT_SL), slShown, m_focusField == "sl", false, pal, "—");

      string tpShown = (m_focusField == "tp") ? m_editBuffer : (m_plan.tpPrice > 0 ? DoubleToString(m_plan.tpPrice, m_sym.digits) : "");
      DrawField(m_rc.fieldTP, L(TXT_TP), tpShown, m_focusField == "tp", false, pal, "—");

      DrawKV(m_rc.rowLots,   L(TXT_LOTS),          m_result.lots > 0 ? DoubleToString(m_result.lots, 2) : "—", pal, pal.textPrimary);
      DrawKV(m_rc.rowRisk,   L(TXT_RISK_AMOUNT),   m_result.riskMoney > 0 ? CXautUtils::FormatMoney(m_result.riskMoney, m_currency) : "—", pal, pal.sell);
      DrawKV(m_rc.rowReward, L(TXT_REWARD_AMOUNT), m_result.rewardMoney > 0 ? CXautUtils::FormatMoney(m_result.rewardMoney, m_currency) : "—", pal, pal.buy);
      DrawKV(m_rc.rowRR,     L(TXT_RR),            m_result.rr > 0 ? ("1 : " + DoubleToString(m_result.rr, 2)) : "—", pal, pal.accentGold);

      bool ok = (m_result.code == VALID_OK);
      color bannerClr = ok ? pal.textMuted : pal.warning;
      string bannerTxt = ok ? (L(TXT_SPREAD) + ": " + DoubleToString((m_sym.ask - m_sym.bid) / MathMax(m_sym.point, 1e-10), 0))
                             : ErrText(m_result.code);
      FillRect(m_rc.banner, pal.cardAlt);
      DrawCentered(m_rc.banner, bannerTxt, bannerClr);

      bool armedBuy  = (m_armBuyUntil  > TimeCurrent());
      bool armedSell = (m_armSellUntil > TimeCurrent());
      bool buyEnabled  = ok && (m_plan.direction == TRADE_DIR_BUY);
      bool sellEnabled = ok && (m_plan.direction == TRADE_DIR_SELL);
      DrawTradeButton(m_rc.btnBuy,  armedBuy  ? "?" : L(TXT_BUY),  pal.buy,  buyEnabled,  pal);
      DrawTradeButton(m_rc.btnSell, armedSell ? "?" : L(TXT_SELL), pal.sell, sellEnabled, pal);
     }

   void DrawTradeButton(const SRect &r, const string label, const color base, const bool enabled, const SPalette &pal)
     {
      FillRect(r, enabled ? base : pal.cardAlt, (uchar)(enabled ? 255 : 160));
      DrawCentered(r, label, enabled ? CTheme::HeaderText() : pal.textMuted);
     }

   void DrawKV(const SRect &r, const string k, const string v, const SPalette &pal, const color vClr)
     {
      bool rtl = RTL();
      int kx = rtl ? r.x + r.w : r.x;
      int vx = rtl ? r.x : r.x + r.w;
      uint ka = (rtl ? TA_RIGHT : TA_LEFT) | TA_VCENTER;
      uint va = (rtl ? TA_LEFT : TA_RIGHT) | TA_VCENTER;
      int cy = r.y + r.h / 2;
      if(rtl) { TextFa(kx, cy, k, pal.textMuted, ka); TextFa(vx, cy, v, vClr, va); }
      else     { Text(kx, cy, k, pal.textMuted, ka);   Text(vx, cy, v, vClr, va); }
     }

   string FormatRisk()
     {
      if(m_plan.riskMode == RISK_MODE_FIXED_MONEY)
         return DoubleToString(m_plan.riskValue, 2) + " " + m_currency;
      return DoubleToString(m_plan.riskValue, 2) + " %";
     }

   void RiskSliderRange(double &lo, double &hi)
     {
      if(m_plan.riskMode == RISK_MODE_FIXED_MONEY)
        {
         lo = 1.0;
         hi = MathMax(50.0, AccountInfoDouble(ACCOUNT_BALANCE) * 0.2);
        }
      else
        {
         lo = 0.1;
         hi = 10.0;
        }
     }

   string ErrText(const ENUM_VALIDATION_CODE code)
     {
      switch(code)
        {
         case VALID_ERR_NO_SYMBOL:        return L(TXT_ERR_NO_SYMBOL);
         case VALID_ERR_TRADE_DISABLED:   return L(TXT_ERR_TRADE_DISABLED);
         case VALID_ERR_MARKET_CLOSED:    return L(TXT_ERR_MARKET_CLOSED);
         case VALID_ERR_SL_MISSING:       return L(TXT_ERR_SL_MISSING);
         case VALID_ERR_SL_WRONG_SIDE:    return L(TXT_ERR_SL_WRONG_SIDE);
         case VALID_ERR_TP_WRONG_SIDE:    return L(TXT_ERR_TP_WRONG_SIDE);
         case VALID_ERR_STOPS_LEVEL:      return L(TXT_ERR_STOPS_LEVEL);
         case VALID_ERR_FREEZE_LEVEL:     return L(TXT_ERR_FREEZE_LEVEL);
         case VALID_ERR_VOLUME_TOO_SMALL: return L(TXT_ERR_VOLUME_TOO_SMALL);
         case VALID_ERR_VOLUME_TOO_LARGE: return L(TXT_ERR_VOLUME_TOO_LARGE);
         case VALID_ERR_MARGIN:           return L(TXT_ERR_MARGIN);
         case VALID_ERR_RISK_VALUE:       return L(TXT_ERR_RISK_VALUE);
         case VALID_ERR_ENTRY_WRONG_SIDE: return L(TXT_ERR_ENTRY_WRONG_SIDE);
         case VALID_ERR_BUSY:             return L(TXT_ERR_BUSY);
         default:                         return "";
        }
     }

   //--- ------------------------------------------------------------ input
public:
   ENUM_PANEL_ACTION HandleEvent(const int id, const long lparam, const double dparam, const string sparam)
     {
      if(!m_created) return PANEL_ACTION_NONE;

      if(id == CHARTEVENT_CLICK)
         return OnClick((int)lparam, (int)dparam);

      if(id == CHARTEVENT_MOUSE_MOVE)
         return OnMouseMove((int)lparam, (int)dparam, (int)StringToInteger(sparam));

      if(id == CHARTEVENT_KEYDOWN)
         return OnKeyDown((int)lparam);

      return PANEL_ACTION_NONE;
     }

private:
   bool Local(const int px, const int py, int &lx, int &ly)
     {
      lx = px - m_settings.panelX;
      ly = py - m_settings.panelY;
      return (lx >= 0 && lx < m_rc.scaleW && ly >= 0 && ly < m_rc.scaleH);
     }

   void CommitFocusedField()
     {
      if(m_focusField == "") return;
      double v = StringToDouble(m_editBuffer);
      if(m_focusField == "risk")
        {
         if(CXautUtils::IsFinitePositive(v)) m_plan.riskValue = v;
        }
      else if(m_focusField == "entry") m_plan.entryPrice = v;
      else if(m_focusField == "sl")    m_plan.slPrice = v;
      else if(m_focusField == "tp")    m_plan.tpPrice = v;
      m_focusField = "";
      m_editBuffer = "";
     }

   void BeginFocus(const string field, const double currentValue)
     {
      if(m_focusField == field) return;
      CommitFocusedField();
      m_focusField = field;
      m_editBuffer = (currentValue > 0.0) ? DoubleToString(currentValue, (field == "risk") ? 2 : m_sym.digits) : "";
     }

   ENUM_PANEL_ACTION OnClick(const int px, const int py)
     {
      int lx, ly;
      bool inside = Local(px, py, lx, ly);
      if(!inside)
        {
         if(m_focusField != "") { CommitFocusedField(); return PANEL_ACTION_REDRAW_LINES; }
         return PANEL_ACTION_NONE;
        }

      if(m_rc.header.Contains(lx, ly))
        {
         if(m_rc.btnClose.Contains(lx, ly))     return PANEL_ACTION_CLOSE_REQUESTED;
         if(m_rc.btnMinimize.Contains(lx, ly))
           {
            m_settings.collapsed = !m_settings.collapsed;
            ApplySettingsGeometry(); Draw();
            return PANEL_ACTION_SETTINGS_CHANGED;
           }
         if(m_rc.btnTheme.Contains(lx, ly))
           {
            m_settings.theme = (m_settings.theme == THEME_DARK) ? THEME_LIGHT : THEME_DARK;
            Draw();
            return PANEL_ACTION_SETTINGS_CHANGED;
           }
         if(m_rc.btnSettings.Contains(lx, ly))
           {
            m_settingsOpen = !m_settingsOpen;
            Draw();
            return PANEL_ACTION_NONE;
           }
         m_dragPanel = true;
         m_dragDX = lx; m_dragDY = ly;
         return PANEL_ACTION_NONE;
        }

      if(m_settings.collapsed) return PANEL_ACTION_NONE;

      if(m_settingsOpen)
         return OnClickSettings(lx, ly);

      return OnClickTrading(lx, ly);
     }

   ENUM_PANEL_ACTION OnClickSettings(const int lx, const int ly)
     {
      if(m_rc.setThemeDark.Contains(lx, ly))  { m_settings.theme = THEME_DARK;  Draw(); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setThemeLight.Contains(lx, ly)) { m_settings.theme = THEME_LIGHT; Draw(); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setLangFa.Contains(lx, ly))     { m_settings.lang = LANG_FA; Draw(); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setLangEn.Contains(lx, ly))     { m_settings.lang = LANG_EN; Draw(); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setScaleMinus.Contains(lx, ly)) { SetScale(m_settings.uiScale - 0.1); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setScalePlus.Contains(lx, ly))  { SetScale(m_settings.uiScale + 0.1); return PANEL_ACTION_SETTINGS_CHANGED; }
      if(m_rc.setScaleTrack.Contains(lx, ly))
        {
         double t = (double)(lx - m_rc.setScaleTrack.x) / MathMax(1, m_rc.setScaleTrack.w);
         SetScale(XAUT_PANEL_MIN_SCALE + t * (XAUT_PANEL_MAX_SCALE - XAUT_PANEL_MIN_SCALE));
         return PANEL_ACTION_SETTINGS_CHANGED;
        }
      if(m_rc.setBack.Contains(lx, ly)) { m_settingsOpen = false; Draw(); return PANEL_ACTION_SETTINGS_CHANGED; }
      return PANEL_ACTION_NONE;
     }

   void SetScale(const double v)
     {
      m_settings.uiScale = MathMax(XAUT_PANEL_MIN_SCALE, MathMin(XAUT_PANEL_MAX_SCALE, v));
      ApplySettingsGeometry();
      Draw();
     }

   ENUM_PANEL_ACTION OnClickTrading(const int lx, const int ly)
     {
      if(m_rc.tabRiskPct.Contains(lx, ly))    { CommitFocusedField(); m_plan.riskMode = RISK_MODE_PERCENT_BALANCE; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabRiskEquity.Contains(lx, ly)) { CommitFocusedField(); m_plan.riskMode = RISK_MODE_PERCENT_EQUITY;  Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabRiskFixed.Contains(lx, ly))  { CommitFocusedField(); m_plan.riskMode = RISK_MODE_FIXED_MONEY;     Draw(); return PANEL_ACTION_REDRAW_LINES; }

      if(m_rc.tabMarket.Contains(lx, ly)) { CommitFocusedField(); m_plan.placement = PLACEMENT_MARKET; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabLimit.Contains(lx, ly))  { CommitFocusedField(); m_plan.placement = PLACEMENT_LIMIT;  Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabStop.Contains(lx, ly))   { CommitFocusedField(); m_plan.placement = PLACEMENT_STOP;   Draw(); return PANEL_ACTION_REDRAW_LINES; }

      if(m_rc.fieldRiskValue.Contains(lx, ly)) { BeginFocus("risk", m_plan.riskValue); Draw(); return PANEL_ACTION_NONE; }
      if(m_rc.fieldEntry.Contains(lx, ly) && m_plan.placement != PLACEMENT_MARKET)
        { BeginFocus("entry", m_plan.entryPrice); Draw(); return PANEL_ACTION_NONE; }
      if(m_rc.fieldSL.Contains(lx, ly)) { BeginFocus("sl", m_plan.slPrice); Draw(); return PANEL_ACTION_NONE; }
      if(m_rc.fieldTP.Contains(lx, ly)) { BeginFocus("tp", m_plan.tpPrice); Draw(); return PANEL_ACTION_NONE; }

      if(m_rc.sliderRisk.Contains(lx, ly))
        {
         CommitFocusedField();
         m_dragSlider = true;
         ApplySliderX(lx);
         return PANEL_ACTION_REDRAW_LINES;
        }

      bool buyEnabled  = (m_result.code == VALID_OK) && (m_plan.direction == TRADE_DIR_BUY);
      bool sellEnabled = (m_result.code == VALID_OK) && (m_plan.direction == TRADE_DIR_SELL);

      if(m_rc.btnBuy.Contains(lx, ly) && buyEnabled)
        {
         CommitFocusedField();
         if(m_armBuyUntil > TimeCurrent())
           {
            m_armBuyUntil = 0;
            return PANEL_ACTION_SEND_BUY;
           }
         m_armBuyUntil = TimeCurrent() + XAUT_ARM_SECONDS;
         m_armSellUntil = 0;
         Draw();
         return PANEL_ACTION_NONE;
        }
      if(m_rc.btnSell.Contains(lx, ly) && sellEnabled)
        {
         CommitFocusedField();
         if(m_armSellUntil > TimeCurrent())
           {
            m_armSellUntil = 0;
            return PANEL_ACTION_SEND_SELL;
           }
         m_armSellUntil = TimeCurrent() + XAUT_ARM_SECONDS;
         m_armBuyUntil = 0;
         Draw();
         return PANEL_ACTION_NONE;
        }

      if(m_focusField != "") { CommitFocusedField(); Draw(); return PANEL_ACTION_REDRAW_LINES; }
      return PANEL_ACTION_NONE;
     }

   void ApplySliderX(const int lx)
     {
      double lo, hi; RiskSliderRange(lo, hi);
      double t = (double)(lx - m_rc.sliderRisk.x) / MathMax(1, m_rc.sliderRisk.w);
      t = MathMax(0.0, MathMin(1.0, t));
      m_plan.riskValue = lo + t * (hi - lo);
      Draw();
     }

   ENUM_PANEL_ACTION OnMouseMove(const int px, const int py, const int flags)
     {
      bool leftDown = (flags & 1) == 1;
      if(!leftDown)
        {
         if(m_dragPanel) { m_dragPanel = false; return PANEL_ACTION_SETTINGS_CHANGED; }
         if(m_dragSlider) { m_dragSlider = false; return PANEL_ACTION_REDRAW_LINES; }
         return PANEL_ACTION_NONE;
        }

      if(m_dragPanel)
        {
         int newX = px - m_dragDX;
         int newY = py - m_dragDY;
         int maxW = (int)ChartGetInteger(m_chartId, CHART_WIDTH_IN_PIXELS, 0);
         int maxH = (int)ChartGetInteger(m_chartId, CHART_HEIGHT_IN_PIXELS, 0);
         newX = MathMax(-(m_rc.scaleW - XAUT_MIN_VISIBLE_PX), MathMin(newX, maxW - XAUT_MIN_VISIBLE_PX));
         newY = MathMax(0, MathMin(newY, MathMax(0, maxH - XAUT_MIN_VISIBLE_PX)));
         m_settings.panelX = newX;
         m_settings.panelY = newY;
         ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_XDISTANCE, newX);
         ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_YDISTANCE, newY);
         return PANEL_ACTION_NONE;
        }

      if(m_dragSlider)
        {
         int lx, ly;
         Local(px, py, lx, ly);
         ApplySliderX(lx);
         return PANEL_ACTION_REDRAW_LINES;
        }

      return PANEL_ACTION_NONE;
     }

   ENUM_PANEL_ACTION OnKeyDown(const int key)
     {
      if(m_focusField == "") return PANEL_ACTION_NONE;

      if(key >= '0' && key <= '9')
        {
         if(StringLen(m_editBuffer) < 14) m_editBuffer += CharToString((uchar)key);
        }
      else if(key >= XAUT_VK_NUMPAD0 && key <= XAUT_VK_NUMPAD9)
        {
         if(StringLen(m_editBuffer) < 14) m_editBuffer += CharToString((uchar)('0' + (key - XAUT_VK_NUMPAD0)));
        }
      else if(key == XAUT_VK_DECIMAL || key == XAUT_VK_OEM_PERIOD)
        {
         if(StringFind(m_editBuffer, ".") < 0) m_editBuffer += ".";
        }
      else if(key == XAUT_VK_BACK)
        {
         int len = StringLen(m_editBuffer);
         if(len > 0) m_editBuffer = StringSubstr(m_editBuffer, 0, len - 1);
        }
      else if(key == XAUT_VK_RETURN)
        {
         CommitFocusedField();
         Draw();
         return PANEL_ACTION_REDRAW_LINES;
        }
      else if(key == XAUT_VK_ESCAPE)
        {
         m_focusField = "";
         m_editBuffer = "";
        }
      else
         return PANEL_ACTION_NONE;

      Draw();
      return PANEL_ACTION_NONE;
     }

public:
   void ClearArmedState()
     {
      if(m_armBuyUntil != 0 && m_armBuyUntil <= TimeCurrent())  { m_armBuyUntil = 0; Draw(); }
      if(m_armSellUntil != 0 && m_armSellUntil <= TimeCurrent()) { m_armSellUntil = 0; Draw(); }
     }
  };
//+------------------------------------------------------------------+
