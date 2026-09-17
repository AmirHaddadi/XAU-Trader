## Hyper Full-Stack Optimization — Core ↔ Client

پروژه را به‌صورت **Full-Stack** بررسی و بهینه‌سازی کن. هدف این فاز، تبدیل سیستم فعلی به یک تجربه‌ی **Hyper-Fast، Reactive و OS-Like** است؛ بدون تغییر غیرضروری در منطق یا قابلیت‌های موجود.

### 1. Interaction & Click Handling

تمام کلیک‌ها، درخواست‌ها و عملیات async باید ذاتاً وضعیت اجرای خود را مدیریت کنند:

* جلوگیری از Double Click و Duplicate Request
* نمایش فوری و استاندارد Loading State
* Spinner مناسب در عملیات زمان‌بر
* Animation کوتاه، نرم و هدفمند
* نمایش Success / Error / Warning Message استاندارد
* Restore شدن صحیح UI بعد از اتمام یا شکست عملیات
* جلوگیری از Freeze یا حالت‌های مبهم در UI
* مدیریت صحیح Cancel / Timeout / Retry در موارد لازم

هدف: کاربر باید همیشه دقیقاً بداند سیستم **در حال انجام چه کاری است**.

### 2. Core ↔ Client Connectivity

کل مسیر ارتباطی Backend/Core و Client را بررسی کن و یک **سیم‌کشی تمیز، سبک و سریع** ایجاد کن:

* بررسی کامل WebSocket و ارتباطات Real-Time
* حذف Connection / Listener / Subscriptionهای اضافی
* جلوگیری از Duplicate Event و Duplicate Handler
* مدیریت صحیح Connect / Disconnect / Reconnect
* کاهش Payload و درخواست‌های غیرضروری
* جلوگیری از Race Condition و Request Collision
* استفاده صحیح از HTTP / WebSocket متناسب با نوع عملیات
* مدیریت Centralized برای Eventها، Stateها و Connectionها
* بررسی Memory Leak و Connection Leak
* کاهش Latency و Overhead در ارتباط Core ↔ Client

هیچ WebSocket یا API صرفاً برای «مدرن بودن» اضافه نکن؛ فقط جایی استفاده شود که واقعاً مزیت معماری یا سرعت ایجاد می‌کند.

### 3. Hyper Performance

کل Flow را از لحظه‌ی Interaction تا پاسخ Core بررسی کن:

**User Interaction → Client → Transport → Core → Processing → Response/Event → Client State → UI**

در هر مرحله دنبال Bottleneck، درخواست اضافه، Serialization اضافی، Listener اضافه، Rendering غیرضروری و تأخیر مصنوعی باش.

اولویت:

**کمترین Overhead + کمترین Latency + کمترین Complexity + بیشترین Responsiveness**

### 4. Full-Stack Execution

فقط Frontend را دستکاری نکن. در صورت نیاز Backend/Core، API، WebSocket Layer، Client State Management و ارتباط بین آن‌ها را هم اصلاح کن.

قابلیت‌های فعلی نباید بدون دلیل تغییر کنند.

**Behavior Preservation الزامی است.**

### 5. کیفیت نهایی

خروجی باید حس یک **سیستم‌عامل واقعی، سریع و قدرتمند** را منتقل کند:

* Immediate Feedback
* Smooth Micro-Animations
* Intelligent Loading
* Reliable Async Operations
* Stable Real-Time Communication
* Minimal Network Overhead
* Clean Connection Lifecycle
* Fast State Synchronization

قبل از Coding ابتدا معماری فعلی و مسیرهای ارتباطی را تحلیل کن، نقاط ضعف را مشخص کن و سپس **کم‌حجم‌ترین و سریع‌ترین اصلاح معماری ممکن** را اجرا کن.

در پایان نیز Syntax، Backend Integration، WebSocket Lifecycle، API Flow و Regressionهای احتمالی را بررسی کن.

**هدف نهایی: Hyper — سریع، واکنش‌گرا، پایدار و تمیز؛ نه صرفاً پر از Animation و Code اضافی.**
