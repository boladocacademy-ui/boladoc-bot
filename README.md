# Boladoc Academy — avtomatik pediatriya posti

AAP, JAMA Pediatrics va CDC (MMWR + Newsroom) manbalaridan pediatriya bo'yicha yangi
maqola/guideline/protokollarni oladi, o'zbek tiliga professional moslashtiradi,
brendli rasm yasaydi va **siz tasdiqlaganingizdan keyin** Telegram kanalga chiqaradi.

## Qanday ishlaydi

```
21:00 (Toshkent)  →  bot 2 ta variant tayyorlab SIZGA shaxsiy chatga yuboradi
                     (rasm + to'liq caption + tugmalar)

siz               →  "✅ A variantni tasdiqlash" yoki "❌ Bugun post chiqmasin"
                     (yoki oddiy javob: A / B / ha / yo'q)

08:00 (Toshkent)  →  tasdiqlangan bo'lsa — kanalga chiqadi
                     tasdiqlanmagan bo'lsa — HECH NARSA chiqmaydi
```

Kanalga aynan siz ko'rgan rasm tushadi (Telegram `file_id` orqali qayta ishlatiladi),
qaytadan generatsiya qilinmaydi.

## Nima bepul

| Qism | Xizmat | Narx |
|---|---|---|
| Ishga tushirish (cron) | GitHub Actions | bepul |
| Tarjima / matn | Google Gemini API (free tier) | bepul |
| AI rasm | Pollinations.ai | bepul, kalit kerak emas |
| Brendli kartochka | lokal (resvg) | bepul |

---

## O'RNATISH — 6 qadam

### 1. Telegram bot yaratish
1. Telegramda [@BotFather](https://t.me/BotFather) ni oching → `/newbot`
2. Nom va username bering (masalan `BoladocAcademyBot`)
3. BotFather bergan **tokenni** saqlang → bu `TELEGRAM_BOT_TOKEN`

### 2. Botni kanalga admin qilish
1. Boladoc Academy kanali → **Administrators** → **Add Administrator**
2. Botni qidirib qo'shing
3. **"Post messages"** huquqini yoqing (qolganlari shart emas)

### 3. Botga /start yozish
Bot sizga draft yubora olishi uchun siz bot bilan chatni ochgan bo'lishingiz kerak.
Botni oching → **Start** bosing.

### 4. Gemini API kaliti (bepul)
1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) ga kiring
2. **Create API key** → kalitni nusxalang → bu `GEMINI_API_KEY`
3. Karta ma'lumoti so'ralmaydi.

### 5. ID larni aniqlash
Kalitlarni `.env` fayliga yozing (bu fayl GitHub'ga hech qachon yuklanmaydi):

```
TELEGRAM_BOT_TOKEN=BotFather_bergan_token
TELEGRAM_CHANNEL_ID=-1003114000709
GEMINI_API_KEY=gemini_kaliti
ADMIN_CHAT_ID=npm_run_check_bergan_raqam
```

Qo'shtirnoq qo'ymang, `=` atrofida bo'sh joy qoldirmang. Keyin:

```powershell
npm install
npm run check
```

Lokal buyruqlar `.env` ni o'zi o'qiydi — `$env:` bilan qo'lda o'rnatish shart emas.
GitHub Actions'da `.env` bo'lmaydi, u yerda Secrets ishlatiladi.

Chiqishda `ADMIN_CHAT_ID = 123456789` ko'rinadi — shuni saqlang.
Skript bot admin ekanini, Gemini ishlashini va 5 ta RSS manbani ham tekshiradi.

### 6. GitHub'ga joylash
1. github.com da yangi repository yarating (masalan `boladoc-bot`).
   Actions daqiqalari cheklanmasligi uchun **Public** tavsiya etiladi —
   kodda maxfiy ma'lumot yo'q, tokenlar Secrets'da saqlanadi.
2. Shu papkadagi fayllarni repoga yuklang (`node_modules` va `out` yuklanmaydi).
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**.
   4 ta secret qo'shing:

   | Nomi | Qiymati |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
   | `TELEGRAM_CHANNEL_ID` | `@BoladocAcademy` |
   | `ADMIN_CHAT_ID` | `npm run check` bergan raqam |
   | `GEMINI_API_KEY` | Gemini kaliti |

4. Repo → **Settings → Actions → General** → pastda
   **Workflow permissions** → **Read and write permissions** ni tanlang.
   (Bot `state/` papkasini yangilab turishi uchun kerak.)

Tayyor. Birinchi draft bugun 21:00 da keladi.

---

## Sinash (kutmasdan)

GitHub → **Actions** → **1) Draft tayyorlash** → **Run workflow**.
Bir necha daqiqada Telegramda variantlar paydo bo'ladi.
Tugmani bosing, keyin **2) Kanalga chiqarish** → **Run workflow** — post darhol chiqadi
(vaqt allaqachon o'tgan bo'lsa skript kutmaydi).

Lokal sinash (Telegramsiz, faqat rasm va caption ko'rish):

```powershell
npm run preview      # out/ papkasiga PNG yasaydi
npm run test:feeds   # faqat manbalar va tanlovni tekshiradi
```

---

## Sozlash

`config.json`:

| Maydon | Ma'nosi |
|---|---|
| `draftCount` | 21:00 da nechta variant kelsin (1–3) |
| `publishAtUtc` | `"03:00"` = 08:00 Toshkent. O'zgartirsangiz `.github/workflows/publish.yml` dagi cron'ni ham surib qo'ying |
| `maxAgeDays` | shundan eski maqolalar tanlanmaydi |
| `feeds` | manbalar; `weight` — ustuvorlik, `peds:true` — feed to'liq pediatrik |
| `image.aiBackground` | `false` qilsangiz AI rasmsiz, faqat brendli gradient kartochka (hozir `false`) |
| `blockedExtra` | shu so'z/ibora uchragan maqola tanlovga umuman kirmaydi |

Taqiqlangan mavzular ro'yxati — `src/relevance.js` dagi `BLOCKED_TOPICS`
(`gender`, `zarar`, `aqsh`). Naqshlar substring bo'yicha solishtiriladi,
shuning uchun yolg'iz `gender` yoki `gun` kabi so'zlar yozilmaydi — ular
"gender differences" va "begun" ga bexosdan mos keladi. Ikki so'zli ibora yozing.

Postning ohangi va tuzilishi — `src/gemini.js` ichidagi prompt.
Caption formati — `src/caption.js`.
Rasm dizayni (ranglar, joylashuv) — `src/image.js` dagi `THEME` va `buildSvg`.

---

## Muhim eslatma

Matnni AI tayyorlaydi. Promptda "manbada bo'lmagan raqam yozma" qoidasi bor va
har post sizning tasdig'ingizdan o'tadi — lekin **chiqarishdan oldin raqam,
doza va tavsiyalarni original maqola bilan solishtirib ko'ring.**
Tibbiy auditoriya uchun bu shart.

## Fayllar

```
src/build-draft.js   21:00 — variantlarni tayyorlab adminga yuboradi
src/publish.js       08:00 — tasdiqni tekshirib kanalga chiqaradi
src/feeds.js         RSS o'qish va abstrakt olish
src/relevance.js     pediatriya filtri va reyting
src/gemini.js        o'zbekcha matn generatsiyasi
src/image.js         AI illyustratsiya + brendli kartochka
src/caption.js       Telegram caption (1024 belgi chegarasi)
src/telegram.js      Telegram Bot API
src/state.js         chiqarilganlar tarixi va joriy draft
src/setup-check.js   sozlamani tekshirish
src/preview.js       lokal ko'rib chiqish
state/               posted.json, draft.json (bot o'zi yangilaydi)
```
