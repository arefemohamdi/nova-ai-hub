<div align="center">
<img src="desktop/icon.png" width="96" />

# Nova AI Hub · نوا AI هاب

**همه هوش‌های مصنوعی، یک جا** — Every AI, one place

چت با همه مدل‌ها · ساخت عکس و ویدیو · محیط کدنویسی شبیه VS Code با هوش مصنوعی · پرووایدر سفارشی · مدل‌های رایگان
فارسی (پیش‌فرض) و انگلیسی · تم تاریک و روشن · وب، ویندوز و اندروید

[⬇️ دانلود آخرین نسخه / Download latest release](../../releases/latest)
</div>

---

## دانلود
| پلتفرم | فایل |
|---|---|
| ویندوز (نصبی) | `Nova-AI-Hub-Setup-x.y.z.exe` |
| ویندوز (پرتابل، بدون نصب) | `Nova-AI-Hub-Portable-x.y.z.exe` |
| اندروید | `Nova-AI-Hub-vx.y.z.apk` |
| وب / سرور | سورس همین مخزن: `node server.js` |

همه فایل‌ها در بخش [Releases](../../releases) هستند.

## امکانات
- **پرووایدرها**: بیش از ۲۵ سرویس آماده: OpenAI، Anthropic Claude، Google Gemini، Moonshot Kimi، DeepSeek، xAI Grok، OpenRouter، Mistral، Groq، Together، Fireworks، Perplexity، Cohere، Qwen، GLM، Cerebras، SambaNova، NVIDIA NIM، Hugging Face، GitHub Models، Novita، SiliconFlow، Ollama، LM Studio، Pollinations.
- **پرووایدر سفارشی**: هر API سازگار با OpenAI / Anthropic / Gemini با Base URL و هدر دلخواه.
- **دریافت خودکار مدل‌ها** با یک دکمه و **تشخیص خودکار قابلیت‌ها** (چت، دید، ساخت تصویر، ساخت ویدیو) + بررسی زنده. افزودن دستی مدل و تغییر قابلیت‌ها.
- **چت**: استریم، نمایش استدلال مدل، Markdown و کد، پیوست عکس و فایل، دستور سیستمی، مقایسه همزمان تا ۳ مدل، کتابخانه پرامپت.
- **کدنویسی (شبیه VS Code)**: یک پوشه از سیستم انتخاب کن؛ درخت فایل‌ها، ادیتور با رنگ‌بندی کد و تب‌ها، ترمینال، و دستیار هوش مصنوعی که **فایل‌های پروژه را مستقیم داخل همان پوشه می‌سازد، ویرایش یا حذف می‌کند**.
- **استودیو تصویر و ویدیو**: FLUX، DALL·E / GPT-Image، Imagen، Veo، Sora و هر مدل تصویرساز دیگر + بهبود پرامپت با هوش مصنوعی.
- **مدل‌های رایگان**: Pollinations بدون کلید و لیست زنده مدل‌های رایگان OpenRouter.
- گالری، پشتیبان‌گیری و بازیابی، رمز ورود، نصب به‌صورت PWA.

## اجرا از سورس (وب)
```bash
node server.js          # Node.js 18+  →  http://localhost:3000
```
هیچ وابستگی‌ای لازم نیست. کلیدهای API فقط روی سیستم خودت در پوشه `data/` ذخیره می‌شوند.

| متغیر | کاربرد |
|---|---|
| `PORT` | پورت (پیش‌فرض 3000) |
| `HOST` | پیش‌فرض `127.0.0.1`. برای دسترسی از گوشی یا شبکه: `0.0.0.0` |
| `APP_PASSWORD` | رمز ورود. وقتی `HOST` عمومی است، دسترسی به پوشه‌ها فقط با رمز فعال می‌شود |
| `DATA_DIR` | محل ذخیره داده‌ها |

Docker: `docker build -t nova . && docker run -p 3000:3000 -e APP_PASSWORD=secret -v $PWD/data:/app/data nova`

## اندروید
اپ اندروید به سرور نوا وصل می‌شود (تا پرووایدرها، مدل‌ها و گفتگوها همه‌جا یکی باشند):
1. روی کامپیوتر اجرا کن: `HOST=0.0.0.0 APP_PASSWORD=رمز node server.js`
2. در اپ آدرس `http://IP-کامپیوتر:3000` یا آدرس سرورت را بزن.

## ساخت نسخه‌ها
- ویندوز: `npm install && npm run dist:win`
- اندروید (بدون Gradle): `android/build-apk.sh` (راهنما داخل فایل)
- با هر تگ `v*` گیت‌هاب اکشن خودکار نسخه ویندوز و اندروید را می‌سازد و در Releases قرار می‌دهد.

## ساختار
```
server.js        سرور (بدون وابستگی) و API
presets.js       لیست سرویس‌ها (برای افزودن سرویس یک خط اضافه کن)
public/          رابط کاربری (چت، کدنویسی، استودیو، …)
desktop/         نسخه دسکتاپ (Electron)
android/         نسخه اندروید
```

## ربات تلگرام
ربات داخل همین سرور اجرا می‌شود و با وب‌اپ یک داده‌ی مشترک دارد: پرووایدرها، مدل‌ها و گفتگوها (گفتگوهای تلگرام در وب‌اپ با علامت ✈️ دیده می‌شوند).

1. در تلگرام به `@BotFather` برو، `/newbot` بزن و توکن را بگیر.
2. در برنامه: **تنظیمات ← ربات تلگرام**، توکن را بزن و «اتصال و روشن کردن ربات» را بزن.
3. نوع دسترسی را انتخاب کن: با رمز، فقط افراد مشخص (شناسه یا یوزرنیم)، یا همه. سقف پیام روزانه هم قابل تنظیم است.

یا با متغیر محیطی: `TELEGRAM_BOT_TOKEN=... TELEGRAM_PASSWORD=... node server.js`

امکانات ربات: گفتگو با همه‌ی مدل‌ها (پاسخ زنده)، انتخاب مدل با دکمه، ساخت تصویر (`/image`)، تحلیل عکس با مدل‌های دارای دید، فرستادن فایل متنی و کد، فارسی/انگلیسی.

> ربات فقط وقتی کار می‌کند که سرور روشن باشد (روی PC، یا بهتر روی یک VPS). اگر سرور به `api.telegram.org` دسترسی ندارد، در بخش «پیشرفته» آدرس یک پروکسی بگذار.

---
**English** — Nova AI Hub is a self-hosted, zero-dependency AI hub: add any provider (or a custom OpenAI/Anthropic/Gemini-compatible endpoint), fetch models with one click, auto-detect image/video capabilities, chat with every model, generate images & videos, and code with an AI agent that writes files straight into a folder you pick (VS Code-style explorer, editor and terminal). A built-in Telegram bot (Settings → Telegram bot) shares the same providers, models and chats. Windows and Android builds are in [Releases](../../releases). License: MIT.
