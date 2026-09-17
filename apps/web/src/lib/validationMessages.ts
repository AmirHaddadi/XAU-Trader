import type { AppLang, ValidationCode } from "@xau-trader/protocol";

// Wording ported 1:1 from MQL5/Include/XAUTrader/GUI/Localization.mqh
// (CLocalization::En/Fa, TXT_ERR_*) — kept identical so the client sees the
// same phrasing they've already seen in the native panel, in both languages.
const EN: Record<ValidationCode, string> = {
  ok: "",
  err_no_symbol: "Invalid symbol",
  err_trade_disabled: "Trading disabled for this account/symbol",
  err_market_closed: "Market is closed for this symbol",
  err_sl_missing: "Set a stop loss",
  err_sl_wrong_side: "Stop loss is on the wrong side of price",
  err_tp_wrong_side: "Take profit is on the wrong side of price",
  err_stops_level: "Distance to price is below the broker's minimum",
  err_freeze_level: "Price is within the freeze level",
  err_volume_too_small: "Computed volume is below the minimum lot",
  err_volume_too_large: "Computed volume exceeds the maximum lot",
  err_margin: "Not enough free margin",
  err_risk_value: "Invalid risk value",
  err_entry_wrong_side: "Entry price doesn't match the order type",
  err_busy: "Previous order still processing...",
};

const FA: Record<ValidationCode, string> = {
  ok: "",
  err_no_symbol: "نماد معتبر نیست",
  err_trade_disabled: "معامله در این حساب/نماد غیرفعال است",
  err_market_closed: "بازار این نماد بسته است",
  err_sl_missing: "حد ضرر را وارد کنید",
  err_sl_wrong_side: "حد ضرر در سمت اشتباه قیمت است",
  err_tp_wrong_side: "حد سود در سمت اشتباه قیمت است",
  err_stops_level: "فاصله تا قیمت کمتر از حداقل مجاز بروکر است",
  err_freeze_level: "قیمت در محدوده فریز سفارش است",
  err_volume_too_small: "حجم محاسبه‌شده کمتر از حداقل مجاز است",
  err_volume_too_large: "حجم محاسبه‌شده بیشتر از حداکثر مجاز است",
  err_margin: "مارجین آزاد کافی نیست",
  err_risk_value: "مقدار ریسک نامعتبر است",
  err_entry_wrong_side: "قیمت ورود با نوع سفارش همخوانی ندارد",
  err_busy: "در حال پردازش سفارش قبلی...",
};

export function validationMessage(code: ValidationCode, lang: AppLang = "en"): string {
  const dict = lang === "fa" ? FA : EN;
  return dict[code] ?? code;
}
