# تسک ۲ — نماد کریپتو برای تست آخر هفته، سوییچ کراس‌هیر، پرامپت لوگو

این فایل مثل `taskk.md` یک اسپک برای پیاده‌سازی بعدیه، نه گزارش تغییرات انجام‌شده. سه بخش مستقله: افزودن بیت‌کوین/اتریوم برای معامله‌گری تستی در تعطیلات، دکمه فعال/غیرفعال‌سازی کراس‌هیر چارت، و پرامپت تولید تصویر برای لوگوی پروژه.

---

## ۱. نماد بیت‌کوین و اتریوم برای تست آخر هفته

### هدف
بازار طلا (XAUUSD) شنبه/یکشنبه تعطیله، ولی کریپتو ۲۴/۷ فعاله. هدف اینه که بشه در همون رابط کاربری فعلی، بین **XAUUSD / BTCUSD / ETHUSD** سوییچ کرد تا در روزهای تعطیل هم بشه چارت رو دید و پوزیشن تستی گرفت — برای توسعه و تست ابزارها، نه لزوماً معامله‌ی واقعی جدی روی کریپتو.

### محل UI
همون‌جایی که الان چیپ نماد ثابت (`{symbol?.symbol ?? "—"}`) در `TopBar.tsx:133-145` زیر ردیف اول هدر رندر می‌شه، باید به یک سلکتور تبدیل بشه (دراپ‌داون یا سه دکمه‌ی toggle کنار هم: طلا / بیت‌کوین / اتریوم). شکل بصری باید با استایل موجود چیپ (`border-radius: full`, رنگ accent) هماهنگ بمونه، فقط قابل کلیک و انتخاب بشه.

### نکته‌ی معماری مهم — سیستم فعلاً تک‌نمادیه
این محدودیت واقعیه، نه فرضی — قبل از پیاده‌سازی باید در نظر گرفته بشه:

- `apps/bridge/src/state/liveState.ts` یک `symbol: SymbolMeta | undefined` **تکی** نگه می‌داره که با پیام `symbol` از EA پر می‌شه (`eaLink.on("symbol", ...)`).
- `apps/bridge/src/ws/wsServer.ts` همون یک `liveState.symbol` رو به همه‌ی کلاینت‌ها broadcast می‌کنه.
- EA (`MQL5/Experts/XAU-Trader/XAU_Trader.mq5` و `SymbolInfoCache.mqh`) روی نماد چارتی که بهش attach شده کار می‌کنه (`_Symbol`).
- پروتکل (`packages/protocol/src/browser-protocol.ts` و `domain.ts`) هیچ‌جا مفهوم "چند نماد هم‌زمان" یا "نماد انتخابی کاربر" نداره.

یعنی صرفاً اضافه کردن یک دراپ‌داون در فرانت کافی نیست؛ باید داده هم واقعاً از MT5 برای نماد انتخاب‌شده بیاد.

### راهکار پیشنهادی (اسکوپ محدود، مناسب هدف "تست آخر هفته")
چون MQL5 اجازه می‌ده بدون اینکه EA روی چارت آن نماد باشه، به‌شرطی که نماد در Market Watch باشه (که شما BTCUSD/ETHUSD رو اضافه کردید)، با همون یک EA بشه:
- با `SymbolSelect(symbol, true)` نماد رو در Market Watch فعال کرد،
- با `SymbolInfoTick(symbol, tick)` و `CopyRates(symbol, ...)` تیک/کندل نمادهای دیگه رو هم خوند،
- و با `OrderSend` روی نماد دیگه (غیر از نماد چارت) هم سفارش زد — همه بدون نیاز به چارت/EA جداگانه.

پیشنهاد گام‌به‌گام:
1. **پروتکل**: یک واچ‌لیست ثابت `["XAUUSD", "BTCUSD", "ETHUSD"]` تعریف بشه (در `domain.ts` یا یک فایل config جدید در بریج) و یک پیام جدید Browser→Bridge اضافه بشه: مثلاً `WsSelectSymbol = WsEnvelope<"symbol.select", { symbol: string }>`.
2. **بریج**: `liveState` از یک `symbol` تکی به `Map<string, { meta: SymbolMeta; tick: Tick; bars: Map<timeframe, Bar[]> }>` تغییر کنه (یا حداقل نگه‌داشتن state جدا برای هر نماد در واچ‌لیست)، و یک `activeSymbol` که بر اساس آخرین `symbol.select` هر کلاینت تعیین می‌شه (یا per-connection state، نه global — چون در تئوری چند تب می‌تونن نمادهای متفاوت رو ببینن).
3. **EA**: در `SymbolInfoCache.mqh` و بخش تیک/بار در `HistoryScanner.mqh`/`Handlers.mqh`، به‌جای فرض تک‌نماد (`_Symbol`)، روی واچ‌لیست بالا حلقه بزنه و برای هر نماد جدا تیک/کندل/متادیتا رو به بریج push کنه (با فیلد `symbol` در payload که پروتکل جدید WS از قبل داره: `WsBarUpdate`/`WsBarsData` همین الان فیلد `symbol` رو دارن، پس اون بخش تغییر کمی می‌خواد).
4. **سفارش‌گذاری**: `OrderManager.mqh` باید نماد سفارش رو به‌جای `_Symbol` از payload بگیره؛ حجم/ریسک (`RiskEngine.mqh`) باید بر اساس `point`/`tickValueProfit` نماد فعال محاسبه بشه — این مقادیر برای BTCUSD/ETHUSD کاملاً متفاوت از XAUUSD هستن (لات مینیمم، value هر پوینت و غیره)، پس تست دقیق حجم/ریسک قبل از فعال کردن روی حساب واقعی لازمه.
5. **فرانت**: `LiveChart.tsx` باید بر اساس نماد انتخابی، سری کندل رو reset/reload کنه (چارت فعلی و بارهای in-memory مال نماد قبلی نباید مخلوط بشن با نماد جدید). `page.tsx` باید state انتخاب نماد رو نگه داره و پیام `symbol.select` رو موقع تغییر بفرسته.

### نکات ایمنی / هشدار
- چون این برای **تست و توسعه** در آخر هفته‌ست، پیشنهاد می‌شه یک state واضح در UI باشه که نشون بده "در حالت تست کریپتو" هستیم (مثلاً رنگ/برچسب متفاوت روی چیپ نماد) تا کاربر یادش نره که موقع برگشتن بازار طلا باید نماد رو برگردونه به XAUUSD.
- قبل از فعال کردن معامله‌ی واقعی روی BTCUSD/ETHUSD حتماً حجم/مارجین/فریز-لول این دو نماد رو در Market Watch با XAUUSD مقایسه کن — این‌ها معمولاً لوریج و حداقل حجم خیلی متفاوتی دارن.

### فایل‌های کلیدی درگیر
`apps/web/src/components/TopBar.tsx`, `apps/web/src/components/LiveChart.tsx`, `apps/web/src/app/page.tsx`, `packages/protocol/src/domain.ts`, `packages/protocol/src/browser-protocol.ts`, `apps/bridge/src/state/liveState.ts`, `apps/bridge/src/ws/wsServer.ts`, `MQL5/Include/XAUTrader/Money/SymbolInfoCache.mqh`, `MQL5/Include/XAUTrader/Bridge/Handlers.mqh`, `MQL5/Include/XAUTrader/Bridge/HistoryScanner.mqh`, `MQL5/Include/XAUTrader/Trading/OrderManager.mqh`.

---

## ۲. سوییچ فعال/غیرفعال کراس‌هیر (کراسر خط‌چین بالای چارت)

### وضعیت فعلی
`LiveChart.tsx:152-160` هنگام `createChart(...)` هیچ گزینه‌ی `crosshair` صریحی پاس نمی‌ده، پس لایت‌ویت-چارتز از رفتار پیش‌فرض خودش استفاده می‌کنه: همون خط افقی/عمودی نقطه‌چین + برچسب قیمت/زمان روی محورها که الان همیشه فعاله و قابل خاموش کردن نیست.

### رفتار مورد انتظار
یک دکمه‌ی toggle دقیقاً کنار دکمه‌ی مگنت (`ChartToolbar.tsx:157-171`، سمت راست تولبار چارت، همون گروه `ml-auto`) اضافه بشه با آیکون مناسب (مثلاً `faCrosshairs` از `@fortawesome/free-solid-svg-icons`). وقتی خاموشه، `createChart` باید `crosshair: { mode: CrosshairMode.Hidden }` بگیره (یا اگه چارت از قبل ساخته شده، `chart.applyOptions({ crosshair: { mode: CrosshairMode.Hidden } })`)؛ وقتی روشنه برگرده به حالت پیش‌فرض کتابخانه (`CrosshairMode.Normal` یا `Magnet` — هرکدوم رفتار فعلی رو حفظ می‌کنه).

### الگوی پیاده‌سازی
دقیقاً مثل `magnetEnabled` که همین الان در `page.tsx` state نگه‌داری می‌شه و به `ChartToolbar` و `LiveChart` پراپ پاس می‌شه (`LiveChart.tsx:69,109,363-365`) — یک `crosshairEnabled` موازی همون مسیر رو طی کنه:
1. `page.tsx`: state جدید + پرسیست در همون لایه‌ی تنظیمات ماژولار چارت (کنار `gridVisible`/`magnetEnabled`) تا بین رفرش‌ها ریست نشه.
2. `ChartToolbar.tsx`: پراپ‌های `crosshairEnabled`/`onCrosshairToggle`، دکمه‌ی جدید بین دکمه‌ی مگنت و چک‌باکس گرید.
3. `LiveChart.tsx`: پراپ جدید گرفته بشه، و در `useEffect`ای مشابه خط ۳۶۳-۳۶۵ (`chartRef.current?.applyOptions({ crosshair: { mode: ... } })`) روی تغییرش گوش بده. `CrosshairMode` از `"lightweight-charts"` ایمپورت بشه (همون‌جایی که `CandlestickSeries`/`createChart` ایمپورت می‌شن، خط ۴).
4. `lib/i18n.tsx`: کلید ترجمه‌ی جدید برای متن/تول‌تیپ دکمه (هم فارسی هم انگلیسی، مثل `magnetHint`).

### نکته
`PriceLineDragController` و `ChartMagnifierController` (`lib/priceLineDrag.ts`, `lib/chartMagnifier.ts`) به‌صورت مستقل روی canvas خودشون کار می‌کنن و به کراس‌هیر داخلی لایت‌ویت-چارتز وابسته نیستن — پس این تغییر نباید رفتار مگنت واقعی (اسنپ به شدو/ویک) یا مگنیفایر ابزار رسم رو تحت تأثیر قرار بده؛ این دو کاملاً جدا از کراس‌هیر بصری هستن.

### فایل‌های کلیدی درگیر
`apps/web/src/components/ChartToolbar.tsx`, `apps/web/src/components/LiveChart.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/lib/i18n.tsx`.

---

## ۳. پرامپت تولید تصویر لوگو (۲ نسخه برای انتخاب)

هویت بصری پروژه از قبل مشخصه (`apps/web/src/app/globals.css:1-51`): پس‌زمینه‌ی تیره‌ی نیوترال گرم (`#1f1e1d`)، رنگ accent مرجانی/تراکوتا (`#D97757`)، سبز buy (`#56a87b`) و قرمز sell (`#d25a47`)، متن کرم روشن (`#f5f3ee`) — این پالت عیناً از تم چارت MT5 خود پروژه گرفته شده و باید در لوگو هم رعایت بشه تا لوگو با هدر/UI فعلی یکدست دیده بشه. اسم اپ: **XAU Trader** (فارسی: «طلا تریدر»).

هر دو پرامپت زیر رو به یک ابزار تولید تصویر (مثل Midjourney / DALL·E / Ideogram) بده و بهترین خروجی‌ها رو برام بفرست تا در پروژه (favicon، آیکون اپ، هدر، صفحه‌ی لاگین/اسپلش) تزریقشون کنم.

### پرامپت نسخه‌ی ۱ — نماد مینیمال هندسی (مناسب فاوآیکون / آیکون اپ)

```
Minimalist geometric logo mark for a professional gold trading desktop
application named "XAU Trader". A single abstract symbol combining a
subtle upward candlestick/price-chart motif with a bullion bar or "Au"
gold-ingot silhouette, negative space, no text, no wordmark. Flat vector
icon style, centered in a rounded-square badge, clean geometric lines,
2-3 color palette only: warm charcoal background #1F1E1D, terracotta/
coral accent #D97757 as the primary mark color, warm cream #F5F3EE for
subtle highlights. High contrast, crisp edges, perfectly symmetric,
scalable to 16x16 favicon size while remaining legible, flat design
(no gradients, no drop shadows, no 3D bevels, no photorealism), on a
plain dark background, app-icon composition, professional fintech
branding, modern trading platform aesthetic.
```

### پرامپت نسخه‌ی ۲ — لوگوی ترکیبی با وردمارک (مناسب هدر / بردینگ عمومی)

```
Modern fintech wordmark logo for "XAU Trader", a gold and crypto
trading platform. Clean sans-serif custom lettering for "XAU Trader"
paired with a small abstract icon to its left: a minimal candlestick
chart line forming an upward trend that subtly morphs into a gold
ingot bar shape. Horizontal lockup, icon and text on one line. Color
palette: terracotta/coral #D97757 for the icon and accent strokes,
warm off-white #F5F3EE or charcoal #1F1E1D for the wordmark depending
on background, muted warm-neutral tones only, no gold gradient
cliché, no bright yellow, no glossy 3D effects. Flat vector
illustration, generous whitespace, balanced kerning, professional
trading-software branding, suitable for a dark UI header bar,
transparent background, no drop shadow, no mockup frame, no extra text.
```

راهنمای انتخاب: نسخه‌ی ۱ برای جاهایی که فضای کم داریم (favicon، تب مرورگر، آیکون PWA/الکترون) بهتر جواب می‌ده؛ نسخه‌ی ۲ برای هدر اصلی اپ (`TopBar.tsx`) و هر جای برندینگ که جای متن هم هست. هر دو رو اگه تولید شد بفرست، بر اساس وضوح در سایز کوچیک و هماهنگی رنگ با پالت بالا انتخاب نهایی رو با هم می‌کنیم.
