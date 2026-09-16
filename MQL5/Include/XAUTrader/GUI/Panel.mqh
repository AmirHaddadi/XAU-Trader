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
   PANEL_ACTION_CLOSE_REQUESTED,
   PANEL_ACTION_CLOSE_POSITION
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
   bool           m_positionsOpen;
   string         m_focusField;     // "" or "risk" — the only remaining typeable field
   string         m_editBuffer;
   bool           m_caretOn;

   SPositionInfo  m_positions[];
   ulong          m_closeRequestTicket;
   ulong          m_armCloseTicket;
   datetime       m_armCloseUntil;
   int            m_posRowCount;
   ulong          m_posRowTicket[8];
   SRect          m_posRowClose[8];
   int            m_posOverflowCount; // positions that didn't fit and aren't clickable

   bool           m_dragPanel;
   int            m_dragDX, m_dragDY;
   bool           m_dragSlider;

   // Planning/confirm state: lines stay hidden until the user actually starts
   // configuring a trade (m_reviewing), and sending requires an explicit
   // separate confirm step (m_confirming) rather than a timed re-click.
   bool           m_reviewing;
   bool           m_confirming;
   ENUM_TRADE_DIR m_confirmDir;

   // All panel TEXT is drawn as native OBJ_LABEL chart objects, not via
   // CCanvas::TextOut. On this Wine install, CCanvas's off-screen GDI text
   // rasterization silently produces nothing (confirmed: the chart-native
   // OBJ_TEXT price captions in LevelLines render fine, while every canvas
   // TextOut call renders blank, even after installing real fonts +
   // vcrun2019) — native chart objects are the pathway proven to work here,
   // so text uses that unconditionally rather than gambling on a GDI fix.
   int            m_labelSeq;
   int            m_labelCountPrev;
   int            m_labelLX[64];
   int            m_labelLY[64];

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

   void DrawIconPositions(const int cx, const int cy, const int half, const color clr)
     {
      for(int i = -1; i <= 1; i++)
        {
         int y = cy + i * (half - 1);
         m_canvas.Line(cx - half, y, cx + half, y, clr);
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

   ENUM_ANCHOR_POINT AlignToAnchor(const uint align)
     {
      uint h = align & 3;   // 0=TA_LEFT, 1=TA_CENTER, 2=TA_RIGHT
      uint v = align & 12;  // 0=TA_TOP,  4=TA_VCENTER, 8=TA_BOTTOM
      if(v == 0) { if(h == 0) return ANCHOR_LEFT_UPPER; if(h == 1) return ANCHOR_UPPER; return ANCHOR_RIGHT_UPPER; }
      if(v == 4) { if(h == 0) return ANCHOR_LEFT;       if(h == 1) return ANCHOR_CENTER; return ANCHOR_RIGHT; }
      { if(h == 0) return ANCHOR_LEFT_LOWER; if(h == 1) return ANCHOR_LOWER; return ANCHOR_RIGHT_LOWER; }
     }

   // Renders one string as a native OBJ_LABEL positioned at panel-local (x,y),
   // reusing/creating XAUT_TXT_<n> in sequence order each Draw() pass so the
   // object count naturally tracks whichever sub-view is currently visible.
   void Lbl(const int x, const int y, const string s, const color clr, const uint align, const string fontName, const int fontSize)
     {
      int idx = m_labelSeq;
      m_labelSeq++;
      if(idx >= 64) return; // panel never has anywhere near this many text nodes
      m_labelLX[idx] = x;
      m_labelLY[idx] = y;

      string name = XAUT_OBJ_PREFIX + "TXT_" + IntegerToString(idx);
      if(ObjectFind(m_chartId, name) < 0)
        {
         ObjectCreate(m_chartId, name, OBJ_LABEL, 0, 0, 0);
         ObjectSetInteger(m_chartId, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
         ObjectSetInteger(m_chartId, name, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(m_chartId, name, OBJPROP_HIDDEN, true);
         ObjectSetInteger(m_chartId, name, OBJPROP_BACK, false);
         ObjectSetInteger(m_chartId, name, OBJPROP_ZORDER, 101); // above the panel bitmap itself
        }
      ObjectSetInteger(m_chartId, name, OBJPROP_XDISTANCE, m_settings.panelX + x);
      ObjectSetInteger(m_chartId, name, OBJPROP_YDISTANCE, m_settings.panelY + y);
      ObjectSetInteger(m_chartId, name, OBJPROP_ANCHOR, AlignToAnchor(align));
      ObjectSetInteger(m_chartId, name, OBJPROP_COLOR, clr);
      ObjectSetString(m_chartId, name, OBJPROP_FONT, fontName);
      ObjectSetInteger(m_chartId, name, OBJPROP_FONTSIZE, fontSize);
      ObjectSetString(m_chartId, name, OBJPROP_TEXT, s == "" ? " " : s);
     }

   void Text(const int x, const int y, const string s, const color clr, const uint align, const bool bold = false)
     {
      Lbl(x, y, s, clr, align, "MiSans", (int)MathRound(11 * m_settings.uiScale));
     }

   void TextFa(const int x, const int y, const string s, const color clr, const uint align)
     {
      Lbl(x, y, s, clr, align, "Vazir", (int)MathRound(12 * m_settings.uiScale));
     }

   // Slides every already-placed label by the same delta the panel just
   // moved by, so dragging the title bar doesn't leave the text behind.
   void RepositionAllLabels()
     {
      for(int i = 0; i < m_labelSeq; i++)
        {
         string name = XAUT_OBJ_PREFIX + "TXT_" + IntegerToString(i);
         ObjectSetInteger(m_chartId, name, OBJPROP_XDISTANCE, m_settings.panelX + m_labelLX[i]);
         ObjectSetInteger(m_chartId, name, OBJPROP_YDISTANCE, m_settings.panelY + m_labelLY[i]);
        }
     }

   void PruneUnusedLabels()
     {
      for(int i = m_labelSeq; i < m_labelCountPrev; i++)
        {
         string name = XAUT_OBJ_PREFIX + "TXT_" + IntegerToString(i);
         if(ObjectFind(m_chartId, name) >= 0)
            ObjectDelete(m_chartId, name);
        }
      m_labelCountPrev = m_labelSeq;
     }

   void DeleteAllLabels()
     {
      for(int i = 0; i < 64; i++)
        {
         string name = XAUT_OBJ_PREFIX + "TXT_" + IntegerToString(i);
         if(ObjectFind(m_chartId, name) >= 0)
            ObjectDelete(m_chartId, name);
        }
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
   CPanel()
     {
      m_created = false; m_settingsOpen = false; m_positionsOpen = false; m_focusField = "";
      m_dragPanel = false; m_dragSlider = false; m_caretOn = true;
      m_reviewing = false; m_confirming = false; m_confirmDir = TRADE_DIR_BUY;
      m_labelSeq = 0; m_labelCountPrev = 0;
      m_closeRequestTicket = 0; m_armCloseTicket = 0; m_armCloseUntil = 0;
      m_posRowCount = 0; m_posOverflowCount = 0;
     }

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
      // Not selectable — clicks/drags on the panel are kept off the chart
      // underneath via CHART_MOUSE_SCROLL (toggled by the EA based on
      // CPanel::ContainsPoint()), not by fighting over object selection.
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_SELECTED, false);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_HIDDEN, true);
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_BACK, false);
      // High z-order so the panel always draws above the chart-native
      // Entry/SL/TP lines, which otherwise could render in front of it.
      ObjectSetInteger(m_chartId, XAUT_PANEL_OBJ, OBJPROP_ZORDER, 100);

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
      DeleteAllLabels();
      m_created = false;
     }

   bool IsCreated() const { return m_created; }
   STradePlan     GetPlan()     const { return m_plan; }
   SAppSettings   GetSettings() const { return m_settings; }
   SRiskResult    GetResult()   const { return m_result; }

   // Whether the planning Entry/SL/TP lines should be visible on the chart —
   // only once the user has actually started configuring a trade, never by
   // default on attach/reset (kept out of the way otherwise per feedback).
   bool IsReviewing() const { return m_reviewing || m_confirming; }

   void SetPlan(const STradePlan &p) { m_plan = p; }

   void UpdateMarket(const SRiskResult &res, const SSymbolSnapshot &sym, const string currency)
     {
      m_result = res;
      m_sym = sym;
      m_currency = currency;
     }

   void SetPositions(const SPositionInfo &positions[])
     {
      ArrayResize(m_positions, ArraySize(positions));
      for(int i = 0; i < ArraySize(positions); i++)
         m_positions[i] = positions[i];
     }

   ulong ConsumeCloseRequest()
     {
      ulong t = m_closeRequestTicket;
      m_closeRequestTicket = 0;
      return t;
     }

   void ToggleCaret() { m_caretOn = !m_caretOn; }

   //--- Whether a chart point is over the panel — the EA uses this to toggle
   //--- CHART_MOUSE_SCROLL off while the cursor is over us, which is the
   //--- actual, official fix for clicks/drags on the panel affecting the
   //--- chart underneath (panning/scrolling). Selectable-object tricks were
   //--- tried first and were unreliable; this chart-level property is the
   //--- documented mechanism and needs no per-widget hit-testing games.
   bool ContainsPoint(const int px, const int py) const
     {
      int lx = px - m_settings.panelX;
      int ly = py - m_settings.panelY;
      return (lx >= 0 && lx < m_rc.scaleW && ly >= 0 && ly < m_rc.scaleH);
     }

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
      m_labelSeq = 0;
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
      DrawIconPositions(m_rc.btnPositions.x + m_rc.btnPositions.w / 2, hcy, (int)(6 * m_settings.uiScale), ArraySize(m_positions) > 0 ? pal.accentGold : CTheme::HeaderText());
      DrawIconMinimize(m_rc.btnMinimize.x + m_rc.btnMinimize.w / 2, hcy, (int)(6 * m_settings.uiScale), CTheme::HeaderText());
      DrawIconClose(m_rc.btnClose.x + m_rc.btnClose.w / 2, hcy, (int)(5 * m_settings.uiScale), CTheme::HeaderText());

      if(m_settings.collapsed)
        {
         PruneUnusedLabels();
         m_canvas.Update();
         ChartRedraw(m_chartId);
         return;
        }

      if(m_settingsOpen)
         DrawSettingsBody(pal);
      else if(m_positionsOpen)
         DrawPositionsBody(pal);
      else
         DrawTradingBody(pal);

      PruneUnusedLabels();
      m_canvas.Update();
      // Object-property writes (bitmap + every label) don't repaint on their
      // own between ticks — without this, dragging/typing looked completely
      // frozen even though the underlying state was updating correctly.
      ChartRedraw(m_chartId);
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

   void DrawPositionsBody(const SPalette &pal)
     {
      m_posRowCount = 0;
      m_posOverflowCount = 0;
      bool rtl = RTL();
      int n = ArraySize(m_positions);

      int titleH = (int)MathRound(22 * m_settings.uiScale);
      DrawLabel(rtl ? m_rc.contentX + m_rc.contentW : m_rc.contentX, m_rc.contentY0,
                L(TXT_OPEN_POSITIONS) + " (" + IntegerToString(n) + ")", pal.textPrimary, !rtl);

      int y = m_rc.contentY0 + titleH + m_rc.gap;

      if(n == 0)
        {
         SRect empty = { m_rc.contentX, y, m_rc.contentW, (int)MathRound(60 * m_settings.uiScale) };
         DrawCentered(empty, L(TXT_NO_POSITIONS), pal.textMuted);
         return;
        }

      int rh = (int)MathRound(46 * m_settings.uiScale);
      int availH = m_rc.scaleH - y - m_rc.pad;
      int maxRows = MathMax(1, availH / rh);
      int shown = MathMin(n, maxRows);
      if(n > maxRows)
         shown = MathMax(1, maxRows - 1); // leave room for the "+N more" line

      for(int i = 0; i < shown; i++)
        {
         DrawPositionRow(m_positions[i], y, rh, pal);
         y += rh;
        }

      if(n > shown)
        {
         m_posOverflowCount = n - shown;
         SRect moreRect = { m_rc.contentX, y, m_rc.contentW, rh };
         DrawCentered(moreRect, "+" + IntegerToString(m_posOverflowCount) + " " + L(TXT_MORE_POSITIONS), pal.textMuted);
        }
     }

   void DrawPositionRow(const SPositionInfo &p, const int y, const int rh, const SPalette &pal)
     {
      bool rtl = RTL();
      bool isBuy = (p.type == POSITION_TYPE_BUY);
      color dirClr = isBuy ? pal.buy : pal.sell;
      color plClr  = (p.profit >= 0.0) ? pal.buy : pal.sell;
      int gapSmall = (int)MathRound(6 * m_settings.uiScale);
      int btn = (int)MathRound(26 * m_settings.uiScale);

      SRect closeRect;
      closeRect.y = y + (rh - btn) / 2;
      closeRect.w = btn;
      closeRect.h = btn;
      int textX, textW;
      if(rtl)
        {
         closeRect.x = m_rc.contentX;
         textX = m_rc.contentX + btn + gapSmall;
         textW = m_rc.contentW - btn - gapSmall;
        }
      else
        {
         closeRect.x = m_rc.contentX + m_rc.contentW - btn;
         textX = m_rc.contentX;
         textW = m_rc.contentW - btn - gapSmall;
        }

      int line1Y = y + (int)MathRound(4 * m_settings.uiScale);
      int line2Y = y + (int)MathRound(24 * m_settings.uiScale);

      string dirTxt = (isBuy ? L(TXT_BUY) : L(TXT_SELL)) + " " + DoubleToString(p.volume, 2) + " @ " + DoubleToString(p.priceOpen, m_sym.digits);
      string plTxt  = (p.profit >= 0.0 ? "+" : "") + DoubleToString(p.profit, 2);
      DrawSplitLine(textX, line1Y, textW, dirTxt, dirClr, plTxt, plClr, rtl);

      string levelsTxt = L(TXT_SL) + " " + (p.sl > 0.0 ? DoubleToString(p.sl, m_sym.digits) : "—") +
                          "   " + L(TXT_TP) + " " + (p.tp > 0.0 ? DoubleToString(p.tp, m_sym.digits) : "—");
      DrawLabel(rtl ? textX + textW : textX, line2Y, levelsTxt, pal.textMuted, !rtl);

      bool armed = (m_armCloseTicket == p.ticket && m_armCloseUntil > TimeCurrent());
      FillRect(closeRect, armed ? pal.sell : pal.cardAlt);
      DrawCentered(closeRect, armed ? "?" : "×", armed ? CTheme::HeaderText() : pal.textMuted);

      if(m_posRowCount < 8)
        {
         m_posRowTicket[m_posRowCount] = p.ticket;
         m_posRowClose[m_posRowCount] = closeRect;
         m_posRowCount++;
        }
     }

   // "start" = reading-start side (left for LTR, right for RTL), "end" = the other side.
   void DrawSplitLine(const int x, const int y, const int w, const string startText, const color startClr,
                       const string endText, const color endClr, const bool rtl)
     {
      int startX = rtl ? x + w : x;
      int endX   = rtl ? x     : x + w;
      uint startAlign = (rtl ? TA_RIGHT : TA_LEFT) | TA_TOP;
      uint endAlign   = (rtl ? TA_LEFT  : TA_RIGHT) | TA_TOP;
      if(rtl) { TextFa(startX, y, startText, startClr, startAlign); TextFa(endX, y, endText, endClr, endAlign); }
      else     { Text(startX, y, startText, startClr, startAlign);   Text(endX, y, endText, endClr, endAlign); }
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

      DrawRRStepper(pal);

      if(m_confirming)
         DrawConfirmArea(pal);
      else
         DrawCentered(m_rc.confirmArea, L(TXT_START_HINT), pal.textMuted);

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

      if(m_confirming)
        {
         bool sendOk = ok && (m_plan.direction == m_confirmDir);
         color yesClr = (m_confirmDir == TRADE_DIR_BUY) ? pal.buy : pal.sell;
         DrawTradeButton(m_rc.btnBuy,  L(TXT_CONFIRM), yesClr,      sendOk, pal);
         DrawTradeButton(m_rc.btnSell, L(TXT_CANCEL),  pal.cardAlt, true,   pal);
        }
      else
        {
         bool buyEnabled  = ok && (m_plan.direction == TRADE_DIR_BUY);
         bool sellEnabled = ok && (m_plan.direction == TRADE_DIR_SELL);
         DrawTradeButton(m_rc.btnBuy,  L(TXT_BUY),  pal.buy,  buyEnabled,  pal);
         DrawTradeButton(m_rc.btnSell, L(TXT_SELL), pal.sell, sellEnabled, pal);
        }
     }

   void DrawRRStepper(const SPalette &pal)
     {
      FillRect(m_rc.rrRow, pal.cardAlt);
      StrokeRect(m_rc.rrRow, pal.border);
      DrawCentered(m_rc.rrMinus, "-", pal.textPrimary);
      DrawCentered(m_rc.rrPlus,  "+", pal.textPrimary);
      DrawCentered(m_rc.rrRow, L(TXT_RR) + "  1 : " + DoubleToString(m_plan.rrRatio, 1), pal.textPrimary);
     }

   void DrawConfirmArea(const SPalette &pal)
     {
      bool buy = (m_confirmDir == TRADE_DIR_BUY);
      bool marketMode = (m_plan.placement == PLACEMENT_MARKET);
      double entry = marketMode ? (buy ? m_sym.ask : m_sym.bid) : m_plan.entryPrice;
      color sideClr = buy ? pal.buy : pal.sell;
      bool rtl = RTL();
      int x0 = rtl ? m_rc.confirmArea.x + m_rc.confirmArea.w : m_rc.confirmArea.x;
      int cy1 = m_rc.confirmArea.y + (int)MathRound(6 * m_settings.uiScale);

      string sideTxt = (buy ? L(TXT_BUY) : L(TXT_SELL)) + "  " +
                        (m_result.lots > 0 ? DoubleToString(m_result.lots, 2) : "—") +
                        " @ " + (entry > 0 ? DoubleToString(entry, m_sym.digits) : "—");
      DrawLabel(x0, cy1, sideTxt, sideClr, !rtl);

      int cy2 = cy1 + (int)MathRound(20 * m_settings.uiScale);
      string slTxt = L(TXT_SL) + " " + (m_plan.slPrice > 0 ? DoubleToString(m_plan.slPrice, m_sym.digits) : "—");
      string tpTxt = L(TXT_TP) + " " + (m_plan.tpPrice > 0 ? DoubleToString(m_plan.tpPrice, m_sym.digits) : "—");
      DrawSplitLine(m_rc.confirmArea.x, cy2, m_rc.confirmArea.w, slTxt, pal.sell, tpTxt, pal.buy, rtl);

      if(m_result.code != VALID_OK)
        {
         int cy3 = cy2 + (int)MathRound(20 * m_settings.uiScale);
         DrawLabel(x0, cy3, ErrText(m_result.code), pal.warning, !rtl);
        }
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
            if(m_settingsOpen) m_positionsOpen = false;
            Draw();
            return PANEL_ACTION_NONE;
           }
         if(m_rc.btnPositions.Contains(lx, ly))
           {
            m_positionsOpen = !m_positionsOpen;
            if(m_positionsOpen) m_settingsOpen = false;
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
      if(m_positionsOpen)
         return OnClickPositions(lx, ly);

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

   ENUM_PANEL_ACTION OnClickPositions(const int lx, const int ly)
     {
      for(int i = 0; i < m_posRowCount; i++)
        {
         if(!m_posRowClose[i].Contains(lx, ly))
            continue;
         ulong ticket = m_posRowTicket[i];
         if(m_armCloseTicket == ticket && m_armCloseUntil > TimeCurrent())
           {
            m_armCloseTicket = 0;
            m_closeRequestTicket = ticket;
            return PANEL_ACTION_CLOSE_POSITION;
           }
         m_armCloseTicket = ticket;
         m_armCloseUntil = TimeCurrent() + XAUT_ARM_SECONDS;
         Draw();
         return PANEL_ACTION_NONE;
        }
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
      // While a confirm bar is open, only its own Confirm/Cancel buttons are
      // live — everything else is frozen so the summary being reviewed can't
      // silently drift out from under the user (e.g. risk% changing the lot
      // size shown) before they decide.
      if(m_confirming)
        {
         bool sendOk = (m_result.code == VALID_OK) && (m_plan.direction == m_confirmDir);
         if(m_rc.btnBuy.Contains(lx, ly))
           {
            if(!sendOk) return PANEL_ACTION_NONE;
            ENUM_TRADE_DIR dir = m_confirmDir;
            m_confirming = false;
            m_reviewing = false; // trade is going out — collapse the planning lines
            Draw();
            return (dir == TRADE_DIR_BUY) ? PANEL_ACTION_SEND_BUY : PANEL_ACTION_SEND_SELL;
           }
         if(m_rc.btnSell.Contains(lx, ly))
           {
            m_confirming = false;
            Draw();
            return PANEL_ACTION_REDRAW_LINES;
           }
         return PANEL_ACTION_NONE;
        }

      if(m_rc.tabRiskPct.Contains(lx, ly))    { CommitFocusedField(); m_plan.riskMode = RISK_MODE_PERCENT_BALANCE; m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabRiskEquity.Contains(lx, ly)) { CommitFocusedField(); m_plan.riskMode = RISK_MODE_PERCENT_EQUITY;  m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabRiskFixed.Contains(lx, ly))  { CommitFocusedField(); m_plan.riskMode = RISK_MODE_FIXED_MONEY;     m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }

      if(m_rc.tabMarket.Contains(lx, ly)) { CommitFocusedField(); m_plan.placement = PLACEMENT_MARKET; m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabLimit.Contains(lx, ly))  { CommitFocusedField(); m_plan.placement = PLACEMENT_LIMIT;  m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }
      if(m_rc.tabStop.Contains(lx, ly))   { CommitFocusedField(); m_plan.placement = PLACEMENT_STOP;   m_reviewing = true; Draw(); return PANEL_ACTION_REDRAW_LINES; }

      if(m_rc.fieldRiskValue.Contains(lx, ly)) { BeginFocus("risk", m_plan.riskValue); m_reviewing = true; Draw(); return PANEL_ACTION_NONE; }

      if(m_rc.rrMinus.Contains(lx, ly))
        {
         CommitFocusedField();
         m_plan.rrRatio = MathMax(XAUT_RR_MIN, m_plan.rrRatio - XAUT_RR_STEP);
         m_plan.tpUserSet = false; // ratio is the source of truth again until TP is dragged directly
         m_reviewing = true;
         Draw();
         return PANEL_ACTION_REDRAW_LINES;
        }
      if(m_rc.rrPlus.Contains(lx, ly))
        {
         CommitFocusedField();
         m_plan.rrRatio = MathMin(XAUT_RR_MAX, m_plan.rrRatio + XAUT_RR_STEP);
         m_plan.tpUserSet = false;
         m_reviewing = true;
         Draw();
         return PANEL_ACTION_REDRAW_LINES;
        }

      if(m_rc.sliderRisk.Contains(lx, ly))
        {
         CommitFocusedField();
         m_dragSlider = true;
         m_reviewing = true;
         ApplySliderX(lx);
         return PANEL_ACTION_REDRAW_LINES;
        }

      bool buyEnabled  = (m_result.code == VALID_OK) && (m_plan.direction == TRADE_DIR_BUY);
      bool sellEnabled = (m_result.code == VALID_OK) && (m_plan.direction == TRADE_DIR_SELL);

      if(m_rc.btnBuy.Contains(lx, ly) && buyEnabled)
        {
         CommitFocusedField();
         m_confirming = true;
         m_confirmDir = TRADE_DIR_BUY;
         m_reviewing = true;
         Draw();
         return PANEL_ACTION_REDRAW_LINES;
        }
      if(m_rc.btnSell.Contains(lx, ly) && sellEnabled)
        {
         CommitFocusedField();
         m_confirming = true;
         m_confirmDir = TRADE_DIR_SELL;
         m_reviewing = true;
         Draw();
         return PANEL_ACTION_REDRAW_LINES;
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
         RepositionAllLabels();
         ChartRedraw(m_chartId);
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
      if(m_armCloseTicket != 0 && m_armCloseUntil <= TimeCurrent()) { m_armCloseTicket = 0; Draw(); }
     }
  };
//+------------------------------------------------------------------+
