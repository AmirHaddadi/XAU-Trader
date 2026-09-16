//+------------------------------------------------------------------+
//|                                                     Defines.mqh   |
//|                    XAU-Trader — global constants & enumerations   |
//+------------------------------------------------------------------+
#property strict

#define XAUT_APP_NAME        "XAU Trader"
#define XAUT_APP_VERSION     "1.0.0"
#define XAUT_OBJ_PREFIX      "XAUT_"
#define XAUT_CONFIG_DIR      "XAUTrader\\"
#define XAUT_CONFIG_FILE     "XAUTrader\\panel_settings.ini"
#define XAUT_GV_PREFIX       "XAUT_"          // GlobalVariable name prefix (per-terminal, per-symbol suffix appended)

// Panel geometry (logical pixels at scale = 1.0)
#define XAUT_PANEL_BASE_W    300
#define XAUT_PANEL_BASE_H    470  // must clear the trading body's real content height (~462 at scale 1.0) or the buy/sell row clips off the bottom
#define XAUT_PANEL_MIN_SCALE 0.75
#define XAUT_PANEL_MAX_SCALE 1.75
#define XAUT_HEADER_H        34
#define XAUT_MIN_VISIBLE_PX  40   // header pixels that must always remain on-screen when dragging

// Default distance (percent of price) for an auto-suggested stop, used only
// until the user drags their own SL. Take-profit then auto-tracks the
// panel's R:R ratio off whatever SL is active, until the user drags TP too.
#define XAUT_DEFAULT_STOP_PERCENT 0.1
#define XAUT_DEFAULT_REWARD_RATIO 2.0
#define XAUT_RR_MIN  1.0
#define XAUT_RR_MAX  5.0
#define XAUT_RR_STEP 0.5

//--- Risk sizing mode: how the lot size is derived
enum ENUM_RISK_MODE
  {
   RISK_MODE_PERCENT_BALANCE = 0,   // % of account balance
   RISK_MODE_PERCENT_EQUITY  = 1,   // % of account equity
   RISK_MODE_FIXED_MONEY     = 2    // fixed amount in account currency
  };

//--- Pending/market placement type selected in the panel
enum ENUM_PLACEMENT_TYPE
  {
   PLACEMENT_MARKET = 0,
   PLACEMENT_LIMIT  = 1,
   PLACEMENT_STOP   = 2
  };

//--- Trade direction
enum ENUM_TRADE_DIR
  {
   TRADE_DIR_BUY = 0,
   TRADE_DIR_SELL = 1
  };

//--- Visual theme
enum ENUM_APP_THEME
  {
   THEME_DARK  = 0,
   THEME_LIGHT = 1
  };

//--- UI language
enum ENUM_APP_LANG
  {
   LANG_FA = 0,
   LANG_EN = 1
  };

//--- Result of a validation pass over the current panel inputs
enum ENUM_VALIDATION_CODE
  {
   VALID_OK = 0,
   VALID_ERR_NO_SYMBOL,
   VALID_ERR_TRADE_DISABLED,
   VALID_ERR_MARKET_CLOSED,
   VALID_ERR_SL_MISSING,
   VALID_ERR_SL_WRONG_SIDE,
   VALID_ERR_TP_WRONG_SIDE,
   VALID_ERR_STOPS_LEVEL,
   VALID_ERR_FREEZE_LEVEL,
   VALID_ERR_VOLUME_TOO_SMALL,
   VALID_ERR_VOLUME_TOO_LARGE,
   VALID_ERR_MARGIN,
   VALID_ERR_RISK_VALUE,
   VALID_ERR_ENTRY_WRONG_SIDE,
   VALID_ERR_BUSY
  };
//+------------------------------------------------------------------+
