# XAU Trader

A modular MetaTrader 5 expert advisor: a real-time, on-chart money-management and position-sizing panel, built as the foundation for a future signal/strategy engine.

This is **Phase 1** of a two-phase project. Phase 1 delivers a complete, standalone risk-management cockpit — position sizing, live chart levels, order execution, full appearance control. Phase 2 (not started) will add the signal/strategy layer on top of this same foundation.

## Features (Phase 1)

- **Position sizing** — computes a broker-valid lot size from either a `% of balance`, `% of equity`, or a fixed money amount, given your entry/stop-loss. Every broker constraint is respected: volume min/max/step, stops level, freeze level, and free margin.
- **Live chart levels** — draggable Entry / Stop Loss / Take Profit lines drawn directly on the chart; drag a line and the panel's lot size, risk, reward and R:R recompute instantly. Works for **Market**, **Limit** and **Stop** order types.
- **One-click execution** — Buy/Sell with an arm-then-confirm safeguard (press once to arm, again to confirm) and duplicate-click protection, so a stray click never sends two orders.
- **Fully custom native UI** — a draggable, floating, minimizable panel drawn entirely in MQL5 (no external dependencies). Light and dark themes, adjustable UI scale, Persian/English language toggle with proper RTL layout, and the project's own embedded [Vazir](https://github.com/rastikerdar/vazir-font) (Persian) and MiSans (Latin) fonts.
- **Persisted settings** — theme, language, scale and panel position survive terminal restarts and EA reattachment.

## Roadmap (Phase 2)

A signal/strategy engine plugs into the `Strategy/` module (already scaffolded as `CStrategyBase`) without touching the money-management core.

## Project layout

```
MQL5/
├── Experts/XAU-Trader/XAU_Trader.mq5   Entry point — wires every module together
├── Include/XAUTrader/
│   ├── Core/          Shared enums, structs, stateless helpers
│   ├── Money/          Symbol snapshot + risk/lot-sizing engine
│   ├── Trading/        Order sending/modification (wraps CTrade)
│   ├── Chart/           Draggable Entry/SL/TP price lines
│   ├── GUI/             Native canvas panel, theme, localization
│   ├── Config/          Settings persistence
│   └── Strategy/        Phase-2 extension point (unused for now)
└── Fonts/               Embedded Vazir (fa) + MiSans (en) weights
```

## Installing

The `MQL5/Experts/XAU-Trader` and `MQL5/Include/XAUTrader` folders mirror your terminal's own `MQL5` data folder layout — copy (or symlink, for active development) both into your terminal's `MQL5/Experts` and `MQL5/Include`, plus the two font files into `MQL5/Fonts/`, then compile `XAU_Trader.mq5` in MetaEditor and attach it to a chart.

## License

[MIT](LICENSE) © 2026 Amirreza Haddadi

---

# طلا تریدر (XAU Trader)

یک اکسپرت ماژولار برای متاتریدر ۵: یک پنل مدیریت سرمایه و محاسبه حجم پوزیشن به‌صورت لحظه‌ای روی چارت، که زیرساخت یک موتور سیگنال/استراتژی در آینده هم خواهد بود.

این پروژه در **فاز اول** است. فاز اول یک سیستم کامل و مستقل مدیریت ریسک را تحویل می‌دهد — محاسبه حجم، نمایش لحظه‌ای سطوح روی چارت، اجرای سفارش، و کنترل کامل ظاهر. فاز دوم (هنوز شروع نشده) لایه سیگنال/استراتژی را روی همین زیرساخت اضافه می‌کند.

## امکانات (فاز اول)

- **محاسبه حجم** — حجم معتبر بر اساس محدودیت‌های بروکر را از روی درصدی از موجودی، درصدی از اکوییتی، یا مبلغ ثابت دلاری محاسبه می‌کند؛ همه محدودیت‌های بروکر (حداقل/حداکثر/گام حجم، فاصله مجاز از قیمت، سطح فریز، مارجین آزاد) رعایت می‌شود.
- **سطوح لحظه‌ای روی چارت** — خطوط قابل درگ ورود/حد ضرر/حد سود مستقیماً روی چارت رسم می‌شوند؛ با جابجا کردن هر خط، حجم/ریسک/سود/نسبت ریسک‌به‌ریوارد فوراً به‌روزرسانی می‌شود. برای هر سه نوع سفارش مارکت، لیمیت و استاپ کار می‌کند.
- **اجرای یک‌کلیکی و ایمن** — خرید/فروش با مکانیزم آرم-و-تایید (یک بار برای آماده‌سازی، بار دوم برای تایید) و محافظت در برابر کلیک تکراری.
- **رابط کاربری کاملا اختصاصی** — پنل شناور، قابل جابجایی و کوچک‌شونده، تماماً با MQL5 رسم شده (بدون وابستگی خارجی). تم روشن/تیره، مقیاس قابل تنظیم، زبان فارسی/انگلیسی با چیدمان راست‌به‌چپ صحیح، و فونت‌های اختصاصی وزیر (فارسی) و می‌سنس (لاتین) که در خود پروژه قرار دارند.
- **ذخیره تنظیمات** — تم، زبان، مقیاس و موقعیت پنل بعد از ریستارت ترمینال یا اتصال مجدد اکسپرت حفظ می‌شود.

## نصب

پوشه‌های `MQL5/Experts/XAU-Trader` و `MQL5/Include/XAUTrader` دقیقاً ساختار پوشه دیتای ترمینال شما را دارند — این دو پوشه را (یا برای توسعه فعال، به‌صورت symlink) در مسیر `MQL5/Experts` و `MQL5/Include` ترمینال خودتان قرار دهید، دو فایل فونت را هم در `MQL5/Fonts/` کپی کنید، سپس `XAU_Trader.mq5` را در MetaEditor کامپایل و روی یک چارت اتصال دهید.

## لایسنس

[MIT](LICENSE) © ۲۰۲۶ امیررضا حدادی
