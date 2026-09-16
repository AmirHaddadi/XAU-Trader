//+------------------------------------------------------------------+
//|                                                 Localization.mqh  |
//|         XAU-Trader — fa/en string table for the native panel.     |
//+------------------------------------------------------------------+
#property strict
#include "../Core/Defines.mqh"

enum ENUM_TXT
  {
   TXT_APP_TITLE,
   TXT_SETTINGS,
   TXT_THEME,
   TXT_THEME_DARK,
   TXT_THEME_LIGHT,
   TXT_LANGUAGE,
   TXT_FONT_SCALE,
   TXT_RISK_MODE,
   TXT_RISK_PCT_BALANCE,
   TXT_RISK_PCT_EQUITY,
   TXT_RISK_FIXED_MONEY,
   TXT_RISK_VALUE,
   TXT_ORDER_TYPE,
   TXT_PLACEMENT_MARKET,
   TXT_PLACEMENT_LIMIT,
   TXT_PLACEMENT_STOP,
   TXT_ENTRY,
   TXT_SL,
   TXT_TP,
   TXT_LOTS,
   TXT_RISK_AMOUNT,
   TXT_REWARD_AMOUNT,
   TXT_RR,
   TXT_BUY,
   TXT_SELL,
   TXT_SPREAD,
   TXT_BALANCE,
   TXT_EQUITY,
   TXT_FREE_MARGIN,
   TXT_CLOSE,
   TXT_MINIMIZE,
   TXT_EXPAND,
   TXT_RESET,
   TXT_SAVE,
   TXT_CANCEL,
   TXT_CONFIRM_TITLE,
   TXT_CONFIRM_BODY,
   TXT_SENDING,
   TXT_SENT_OK,
   TXT_SEND_FAILED,
   // validation / error strings (mirror ENUM_VALIDATION_CODE)
   TXT_ERR_NO_SYMBOL,
   TXT_ERR_TRADE_DISABLED,
   TXT_ERR_MARKET_CLOSED,
   TXT_ERR_SL_MISSING,
   TXT_ERR_SL_WRONG_SIDE,
   TXT_ERR_TP_WRONG_SIDE,
   TXT_ERR_STOPS_LEVEL,
   TXT_ERR_FREEZE_LEVEL,
   TXT_ERR_VOLUME_TOO_SMALL,
   TXT_ERR_VOLUME_TOO_LARGE,
   TXT_ERR_MARGIN,
   TXT_ERR_RISK_VALUE,
   TXT_ERR_ENTRY_WRONG_SIDE,
   TXT_ERR_BUSY,
   TXT_OPEN_POSITIONS,
   TXT_NO_POSITIONS,
   TXT_MORE_POSITIONS,
   TXT_CLOSE_POSITION,
   TXT_CONFIRM_CLOSE,
   TXT_COUNT_ // sentinel
  };

class CLocalization
  {
public:
   static string Get(const ENUM_TXT id, const ENUM_APP_LANG lang)
     {
      if(lang == LANG_FA)
         return Fa(id);
      return En(id);
     }

   //--- true when the language reads right-to-left (drives text alignment)
   static bool IsRTL(const ENUM_APP_LANG lang) { return (lang == LANG_FA); }

private:
   static string Fa(const ENUM_TXT id)
     {
      switch(id)
        {
         case TXT_APP_TITLE:            return "طلا تریدر";
         case TXT_SETTINGS:             return "تنظیمات";
         case TXT_THEME:                return "پوسته";
         case TXT_THEME_DARK:           return "تیره";
         case TXT_THEME_LIGHT:          return "روشن";
         case TXT_LANGUAGE:             return "زبان";
         case TXT_FONT_SCALE:           return "اندازه فونت";
         case TXT_RISK_MODE:            return "نوع حجم";
         case TXT_RISK_PCT_BALANCE:     return "٪ موجودی";
         case TXT_RISK_PCT_EQUITY:      return "٪ اکوییتی";
         case TXT_RISK_FIXED_MONEY:     return "مبلغ ثابت $";
         case TXT_RISK_VALUE:           return "مقدار ریسک";
         case TXT_ORDER_TYPE:           return "نوع سفارش";
         case TXT_PLACEMENT_MARKET:     return "مارکت";
         case TXT_PLACEMENT_LIMIT:      return "لیمیت";
         case TXT_PLACEMENT_STOP:       return "استاپ";
         case TXT_ENTRY:                return "ورود";
         case TXT_SL:                   return "حد ضرر";
         case TXT_TP:                   return "حد سود";
         case TXT_LOTS:                 return "حجم";
         case TXT_RISK_AMOUNT:          return "ریسک";
         case TXT_REWARD_AMOUNT:        return "سود احتمالی";
         case TXT_RR:                   return "ریسک به ریوارد";
         case TXT_BUY:                  return "خرید";
         case TXT_SELL:                 return "فروش";
         case TXT_SPREAD:               return "اسپرد";
         case TXT_BALANCE:              return "موجودی";
         case TXT_EQUITY:               return "اکوییتی";
         case TXT_FREE_MARGIN:          return "مارجین آزاد";
         case TXT_CLOSE:                return "بستن";
         case TXT_MINIMIZE:             return "کوچک کردن";
         case TXT_EXPAND:               return "بزرگ کردن";
         case TXT_RESET:                return "پیش‌فرض";
         case TXT_SAVE:                 return "ذخیره";
         case TXT_CANCEL:               return "انصراف";
         case TXT_CONFIRM_TITLE:        return "تایید معامله";
         case TXT_CONFIRM_BODY:         return "سفارش با این مشخصات ارسال شود؟";
         case TXT_SENDING:              return "در حال ارسال...";
         case TXT_SENT_OK:              return "سفارش با موفقیت ثبت شد";
         case TXT_SEND_FAILED:          return "ارسال سفارش ناموفق بود";
         case TXT_ERR_NO_SYMBOL:        return "نماد معتبر نیست";
         case TXT_ERR_TRADE_DISABLED:   return "معامله در این حساب/نماد غیرفعال است";
         case TXT_ERR_MARKET_CLOSED:    return "بازار این نماد بسته است";
         case TXT_ERR_SL_MISSING:       return "حد ضرر را وارد کنید";
         case TXT_ERR_SL_WRONG_SIDE:    return "حد ضرر در سمت اشتباه قیمت است";
         case TXT_ERR_TP_WRONG_SIDE:    return "حد سود در سمت اشتباه قیمت است";
         case TXT_ERR_STOPS_LEVEL:      return "فاصله تا قیمت کمتر از حداقل مجاز بروکر است";
         case TXT_ERR_FREEZE_LEVEL:     return "قیمت در محدوده فریز سفارش است";
         case TXT_ERR_VOLUME_TOO_SMALL: return "حجم محاسبه‌شده کمتر از حداقل مجاز است";
         case TXT_ERR_VOLUME_TOO_LARGE: return "حجم محاسبه‌شده بیشتر از حداکثر مجاز است";
         case TXT_ERR_MARGIN:           return "مارجین آزاد کافی نیست";
         case TXT_ERR_RISK_VALUE:       return "مقدار ریسک نامعتبر است";
         case TXT_ERR_ENTRY_WRONG_SIDE: return "قیمت ورود با نوع سفارش همخوانی ندارد";
         case TXT_ERR_BUSY:             return "در حال پردازش سفارش قبلی...";
         case TXT_OPEN_POSITIONS:       return "پوزیشن‌های باز";
         case TXT_NO_POSITIONS:         return "پوزیشن بازی وجود ندارد";
         case TXT_MORE_POSITIONS:       return "مورد دیگر";
         case TXT_CLOSE_POSITION:       return "بستن";
         case TXT_CONFIRM_CLOSE:        return "برای تایید دوباره بزنید";
         default:                       return "";
        }
     }

   static string En(const ENUM_TXT id)
     {
      switch(id)
        {
         case TXT_APP_TITLE:            return "XAU Trader";
         case TXT_SETTINGS:             return "Settings";
         case TXT_THEME:                return "Theme";
         case TXT_THEME_DARK:           return "Dark";
         case TXT_THEME_LIGHT:          return "Light";
         case TXT_LANGUAGE:             return "Language";
         case TXT_FONT_SCALE:           return "Font Scale";
         case TXT_RISK_MODE:            return "Sizing Mode";
         case TXT_RISK_PCT_BALANCE:     return "% Balance";
         case TXT_RISK_PCT_EQUITY:      return "% Equity";
         case TXT_RISK_FIXED_MONEY:     return "Fixed $";
         case TXT_RISK_VALUE:           return "Risk Value";
         case TXT_ORDER_TYPE:           return "Order Type";
         case TXT_PLACEMENT_MARKET:     return "Market";
         case TXT_PLACEMENT_LIMIT:      return "Limit";
         case TXT_PLACEMENT_STOP:       return "Stop";
         case TXT_ENTRY:                return "Entry";
         case TXT_SL:                   return "Stop Loss";
         case TXT_TP:                   return "Take Profit";
         case TXT_LOTS:                 return "Lots";
         case TXT_RISK_AMOUNT:          return "Risk";
         case TXT_REWARD_AMOUNT:        return "Reward";
         case TXT_RR:                   return "R:R";
         case TXT_BUY:                  return "Buy";
         case TXT_SELL:                 return "Sell";
         case TXT_SPREAD:               return "Spread";
         case TXT_BALANCE:              return "Balance";
         case TXT_EQUITY:               return "Equity";
         case TXT_FREE_MARGIN:          return "Free Margin";
         case TXT_CLOSE:                return "Close";
         case TXT_MINIMIZE:             return "Minimize";
         case TXT_EXPAND:               return "Expand";
         case TXT_RESET:                return "Reset";
         case TXT_SAVE:                 return "Save";
         case TXT_CANCEL:               return "Cancel";
         case TXT_CONFIRM_TITLE:        return "Confirm Trade";
         case TXT_CONFIRM_BODY:         return "Send order with these parameters?";
         case TXT_SENDING:              return "Sending...";
         case TXT_SENT_OK:              return "Order placed successfully";
         case TXT_SEND_FAILED:          return "Order failed";
         case TXT_ERR_NO_SYMBOL:        return "Invalid symbol";
         case TXT_ERR_TRADE_DISABLED:   return "Trading disabled for this account/symbol";
         case TXT_ERR_MARKET_CLOSED:    return "Market is closed for this symbol";
         case TXT_ERR_SL_MISSING:       return "Set a stop loss";
         case TXT_ERR_SL_WRONG_SIDE:    return "Stop loss is on the wrong side of price";
         case TXT_ERR_TP_WRONG_SIDE:    return "Take profit is on the wrong side of price";
         case TXT_ERR_STOPS_LEVEL:      return "Distance to price is below the broker's minimum";
         case TXT_ERR_FREEZE_LEVEL:     return "Price is within the freeze level";
         case TXT_ERR_VOLUME_TOO_SMALL: return "Computed volume is below the minimum lot";
         case TXT_ERR_VOLUME_TOO_LARGE: return "Computed volume exceeds the maximum lot";
         case TXT_ERR_MARGIN:           return "Not enough free margin";
         case TXT_ERR_RISK_VALUE:       return "Invalid risk value";
         case TXT_ERR_ENTRY_WRONG_SIDE: return "Entry price doesn't match the order type";
         case TXT_ERR_BUSY:             return "Previous order still processing...";
         case TXT_OPEN_POSITIONS:       return "Open Positions";
         case TXT_NO_POSITIONS:         return "No open positions";
         case TXT_MORE_POSITIONS:       return "more";
         case TXT_CLOSE_POSITION:       return "Close";
         case TXT_CONFIRM_CLOSE:        return "Tap again to confirm";
         default:                       return "";
        }
     }
  };
//+------------------------------------------------------------------+
