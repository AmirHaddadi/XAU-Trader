//+------------------------------------------------------------------+
//|                                                       Types.mqh   |
//|                    XAU-Trader — shared structs                    |
//+------------------------------------------------------------------+
#property strict
#include "Defines.mqh"

//--- Persisted / editable appearance settings
struct SAppSettings
  {
   ENUM_APP_THEME    theme;
   ENUM_APP_LANG     lang;
   double            uiScale;      // 0.75 .. 1.75
   int               panelX;       // top-left, pixels, corner-relative
   int               panelY;
   int               chartCorner;  // CORNER_LEFT_UPPER etc.
   bool              collapsed;    // minimized to header-only

   void Defaults()
     {
      theme       = THEME_DARK;
      // Forced to English for now: Vazir/Farsi text rendered via a plain
      // TextOut call comes out blank — Arabic-script glyphs need real
      // shaping (joined forms) that the canvas library doesn't do on its
      // own. Re-enable LANG_FA as the default once that's solved.
      lang        = LANG_EN;
      uiScale     = 1.0;
      panelX      = 16;
      panelY      = 16;
      chartCorner = 0; // CORNER_LEFT_UPPER
      collapsed   = false;
     }
  };

//--- The trade plan currently configured in the panel (not yet sent)
struct STradePlan
  {
   ENUM_RISK_MODE       riskMode;
   double                riskValue;     // percent (0..100) or money, depending on riskMode
   ENUM_PLACEMENT_TYPE  placement;
   ENUM_TRADE_DIR       direction;
   double                entryPrice;    // ignored for PLACEMENT_MARKET (live price used)
   double                slPrice;
   double                tpPrice;

   void Defaults()
     {
      riskMode   = RISK_MODE_PERCENT_BALANCE;
      riskValue  = 1.0;
      placement  = PLACEMENT_MARKET;
      direction  = TRADE_DIR_BUY;
      entryPrice = 0.0;
      slPrice    = 0.0;
      tpPrice    = 0.0;
     }
  };

//--- Output of the risk/lot computation for the currently configured plan
struct SRiskResult
  {
   ENUM_VALIDATION_CODE code;
   double                lots;          // final, clamped/rounded to broker step
   double                rawLots;       // before clamping (for UI hint when clamped)
   double                riskMoney;     // monetary risk implied by lots+SL distance
   double                rewardMoney;   // monetary reward implied by lots+TP distance
   double                rr;            // reward:risk ratio (0 if no TP)
   double                marginRequired;
   string                message;       // localized human-readable detail

   void Reset()
     {
      code = VALID_OK;
      lots = 0.0;
      rawLots = 0.0;
      riskMoney = 0.0;
      rewardMoney = 0.0;
      rr = 0.0;
      marginRequired = 0.0;
      message = "";
     }
  };

//--- Cached, per-tick symbol properties needed by risk/order logic
struct SSymbolSnapshot
  {
   string   symbol;
   int      digits;
   double   point;
   double   bid;
   double   ask;
   double   volumeMin;
   double   volumeMax;
   double   volumeStep;
   double   tickSize;
   double   tickValueProfit;
   double   tickValueLoss;
   int      stopsLevelPoints;
   int      freezeLevelPoints;
   long     tradeMode;      // SYMBOL_TRADE_MODE_*
   bool     valid;
  };
//+------------------------------------------------------------------+
