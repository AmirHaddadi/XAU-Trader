//+------------------------------------------------------------------+
//|                                                 PanelLayout.mqh   |
//|   XAU-Trader — resolves every control's pixel rectangle from the  |
//|   current UI scale. Kept separate from drawing/input so the two   |
//|   never drift out of sync (both read the same rects).             |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"

struct SRect
  {
   int x, y, w, h;
   bool Contains(const int px, const int py) const
     {
      return (px >= x && px < x + w && py >= y && py < y + h);
     }
  };

//--- Every interactive/drawn region of the panel, in local (panel-relative) pixels.
struct SPanelRects
  {
   int    scaleW, scaleH;      // total panel size at current scale
   // Reusable geometry constants at the resolved scale, so any procedural
   // layout (e.g. the dynamic-length positions list) doesn't have to
   // recompute/duplicate them.
   int    pad, contentX, contentY0, contentW, rowH, gap, btn;

   SRect  header;
   SRect  btnSettings;
   SRect  btnTheme;
   SRect  btnPositions;
   SRect  btnMinimize;
   SRect  btnClose;

   SRect  tabRiskPct;          // risk-mode segmented control (3 segments)
   SRect  tabRiskEquity;
   SRect  tabRiskFixed;
   SRect  fieldRiskValue;
   SRect  sliderRisk;

   SRect  tabMarket;           // order-type segmented control (3 segments)
   SRect  tabLimit;
   SRect  tabStop;

   SRect  rrRow;               // R:R stepper row ("-" / "1 : 2.0" / "+")
   SRect  rrMinus;
   SRect  rrPlus;
   SRect  confirmArea;         // idle hint, or the pending trade's Entry/SL/TP summary while confirming

   SRect  rowLots;
   SRect  rowRisk;
   SRect  rowReward;
   SRect  rowRR;

   SRect  btnBuy;
   SRect  btnSell;

   SRect  banner;              // validation error / status banner

   // Settings sub-view (shown instead of the trading body when open)
   SRect  setThemeDark, setThemeLight;
   SRect  setLangFa, setLangEn;
   SRect  setScaleMinus, setScalePlus, setScaleTrack;
   SRect  setBack;

   static SPanelRects Build(const double scale, const bool collapsed)
     {
      SPanelRects r;
      int W = (int)MathRound(XAUT_PANEL_BASE_W * scale);
      int H = collapsed ? (int)MathRound(XAUT_HEADER_H * scale) : (int)MathRound(XAUT_PANEL_BASE_H * scale);
      r.scaleW = W;
      r.scaleH = H;

      int pad = (int)MathRound(10 * scale);
      int hh  = (int)MathRound(XAUT_HEADER_H * scale);
      int rowH = (int)MathRound(30 * scale);
      int gap  = (int)MathRound(8 * scale);
      int btn  = (int)MathRound(22 * scale);
      int contentW = W - 2 * pad;

      r.pad = pad; r.contentX = pad; r.contentY0 = hh + pad; r.contentW = contentW;
      r.rowH = rowH; r.gap = gap; r.btn = btn;

      r.header = Mk(0, 0, W, hh);
      r.btnClose     = Mk(W - pad - btn, (hh - btn) / 2, btn, btn);
      r.btnMinimize  = Mk(r.btnClose.x - gap - btn, (hh - btn) / 2, btn, btn);
      r.btnPositions = Mk(r.btnMinimize.x - gap - btn, (hh - btn) / 2, btn, btn);
      r.btnTheme     = Mk(r.btnPositions.x - gap - btn, (hh - btn) / 2, btn, btn);
      r.btnSettings  = Mk(r.btnTheme.x - gap - btn, (hh - btn) / 2, btn, btn);

      if(collapsed)
         return r;

      int y = hh + pad;
      int seg = contentW / 3;

      r.tabRiskPct    = Mk(pad,               y, seg - 4, rowH);
      r.tabRiskEquity = Mk(pad + seg,         y, seg - 4, rowH);
      r.tabRiskFixed  = Mk(pad + seg * 2,     y, seg - 4, rowH);
      y += rowH + gap;

      r.fieldRiskValue = Mk(pad, y, contentW, rowH);
      y += rowH + gap;

      r.sliderRisk = Mk(pad, y, contentW, (int)MathRound(18 * scale));
      y += (int)MathRound(18 * scale) + gap + 2;

      r.tabMarket = Mk(pad,           y, seg - 4, rowH);
      r.tabLimit  = Mk(pad + seg,     y, seg - 4, rowH);
      r.tabStop   = Mk(pad + seg * 2, y, seg - 4, rowH);
      y += rowH + gap;

      r.rrRow   = Mk(pad, y, contentW, rowH);
      r.rrMinus = Mk(pad, y, btn, rowH);
      r.rrPlus  = Mk(pad + contentW - btn, y, btn, rowH);
      y += rowH + gap;

      r.confirmArea = Mk(pad, y, contentW, 2 * rowH + 4);
      y += 2 * rowH + 4 + gap;

      int rowH2 = (int)MathRound(20 * scale);
      r.rowLots   = Mk(pad, y, contentW, rowH2); y += rowH2;
      r.rowRisk   = Mk(pad, y, contentW, rowH2); y += rowH2;
      r.rowReward = Mk(pad, y, contentW, rowH2); y += rowH2;
      r.rowRR     = Mk(pad, y, contentW, rowH2); y += rowH2 + gap;

      r.banner = Mk(pad, y, contentW, (int)MathRound(26 * scale));
      y += (int)MathRound(26 * scale) + gap;

      int btnW = (contentW - gap) / 2;
      int btnH = (int)MathRound(38 * scale);
      r.btnBuy  = Mk(pad, y, btnW, btnH);
      r.btnSell = Mk(pad + btnW + gap, y, btnW, btnH);

      // Settings sub-view reuses the same top region
      int sy = hh + pad;
      r.setThemeDark  = Mk(pad,           sy, seg - 4, rowH);
      r.setThemeLight = Mk(pad + seg,     sy, seg - 4, rowH);
      sy += rowH + gap * 2;
      r.setLangFa = Mk(pad,       sy, contentW / 2 - 4, rowH);
      r.setLangEn = Mk(pad + contentW / 2, sy, contentW / 2 - 4, rowH);
      sy += rowH + gap * 2;
      r.setScaleMinus = Mk(pad, sy, btn, btn);
      r.setScalePlus  = Mk(pad + contentW - btn, sy, btn, btn);
      r.setScaleTrack = Mk(pad + btn + gap, sy + btn / 2 - 2, contentW - 2 * btn - 2 * gap, 4);
      sy += btn + gap * 3;
      r.setBack = Mk(pad, H - pad - btnH, contentW, btnH);

      return r;
     }

private:
   static SRect Mk(const int x, const int y, const int w, const int h)
     {
      SRect r; r.x = x; r.y = y; r.w = w; r.h = h; return r;
     }
  };
//+------------------------------------------------------------------+
