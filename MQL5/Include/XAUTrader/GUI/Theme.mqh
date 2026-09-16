//+------------------------------------------------------------------+
//|                                                        Theme.mqh  |
//|   XAU-Trader — color tokens & typography for the native panel.    |
//|   Palette derived from a finance/trading design-system pass:      |
//|   dark = OLED trading terminal, light = banking/premium-gold.     |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"

//--- Full semantic palette for one theme
struct SPalette
  {
   color background;      // chart-panel backdrop
   color card;             // panel body surface
   color cardAlt;          // secondary surface (inputs, rows)
   color header;           // title bar
   color border;
   color textPrimary;
   color textMuted;
   color accentGold;       // brand identity (XAU)
   color buy;               // positive / long / profit
   color sell;              // negative / short / loss
   color warning;
   color shadow;            // drop-shadow tint behind the panel
  };

class CTheme
  {
public:
   static SPalette Get(const ENUM_APP_THEME theme)
     {
      SPalette p;
      if(theme == THEME_DARK)
        {
         p.background   = (color)C'2,6,23';
         p.card         = (color)C'14,18,35';
         p.cardAlt      = (color)C'26,30,47';
         p.header       = (color)C'15,23,42';
         p.border       = (color)C'51,65,85';
         p.textPrimary  = (color)C'248,250,252';
         p.textMuted    = (color)C'148,163,184';
         p.accentGold   = (color)C'212,175,55';
         p.buy          = (color)C'34,197,94';
         p.sell         = (color)C'239,68,68';
         p.warning      = (color)C'245,158,11';
         p.shadow       = (color)C'0,0,0';
        }
      else
        {
         p.background   = (color)C'248,250,252';
         p.card         = (color)C'255,255,255';
         p.cardAlt      = (color)C'232,236,241';
         p.header       = (color)C'15,23,42';
         p.border       = (color)C'226,232,240';
         p.textPrimary  = (color)C'2,6,23';
         p.textMuted    = (color)C'71,85,105';
         p.accentGold   = (color)C'161,98,7';
         p.buy          = (color)C'22,163,74';
         p.sell         = (color)C'220,38,38';
         p.warning      = (color)C'202,138,4';
         p.shadow       = (color)C'100,110,130';
        }
      return p;
     }

   //--- Header text is always white-on-navy in both themes (brand consistency)
   static color HeaderText() { return (color)C'248,250,252'; }
  };
//+------------------------------------------------------------------+
