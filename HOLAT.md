# HOLAT — 8-avgust 2026

Bu fayl ishni to'xtatgan joyni eslatib turadi. Yangi suhbat boshlaganda
avval shuni o'qing.

## Ishni qanday davom ettirish

Terminalda **albatta** shu papkadan boshlang:

```
cd C:\Users\user
claude
```

Boshqa papkadan boshlansa, eski suhbatlar `/resume` ro'yxatida ko'rinmaydi.

---

## Nima tayyor

Quvur boshdan oxirigacha sinaldi va ishlaydi:

```
RSS (5 manba) → pediatriya filtri → Gemini tarjima → rasm → caption
```

| Qism | Holat |
|---|---|
| Kod | ✅ ishlaydi, 22 ta test o'tadi (`npm test`) |
| Telegram bot | ✅ @Boladocacademymanagerbot |
| Kanal | ✅ @Boladoc_uz (ID `-1003114000709`, 1548 obunachi) |
| Bot kanalda admin | ✅ `can_post_messages: true` |
| ADMIN_CHAT_ID | ✅ `8364248980` |
| Gemini kaliti | ✅ ishlaydi, `.env` faylida |
| Lokal sinov | ✅ `npm run preview` haqiqiy post yasaydi |

**Kanalga hali BIRORTA post chiqmagan.** `state/posted.json` bo'sh.

## Nima tayyor emas

| Ish | Izoh |
|---|---|
| GitHub'ga yuklash | Kod faqat shu kompyuterda (`git remote` bo'sh). GitHub'siz avtomatik jadval ishlamaydi |
| GitHub Secrets | 4 ta secret qo'shilishi kerak — README 6-qadamga qarang |
| Bot tokenini yangilash | Token suhbatda ochiq yozilgan edi. BotFather → `/revoke` → yangi tokenni `.env` va GitHub Secrets'ga qo'yish |

---

## HAL QILINMAGAN 2 TA SAVOL

Ishni davom ettirishdan oldin shu ikkisiga javob kerak.

### 1. AI rasm qolsinmi?

Pollinations.ai bepul, lekin sifati past — sinovda bittasi tushunarsiz
yashil dog', ikkinchisi g'alati manekin boshi chiqdi. Kartochka dizaynining
o'zi yaxshi.

O'chirish uchun `config.json`:

```json
"image": { "aiBackground": false }
```

Shunda faqat toza brendli gradient kartochka qoladi.
**Tavsiya: o'chirish.**

### 2. Qaysi mavzular chiqmasin?

Sinovda bot JAMA Pediatrics'dan "Transgender o'smirlarda balog'atni
bostirish" maqolasini tanladi. Bot to'g'ri ishladi — bu haqiqatan eng yangi
pediatriya maqolasi edi. Lekin auditoriya uchun mos kelmasligi mumkin.

Kerak: taqiqlangan mavzular ro'yxati. Bunday maqolalar tanlovga
umuman kirmaydi (`src/relevance.js` ga qo'shiladi).

Foydalanuvchi qaysi mavzularni istisno qilishni hali aytmagan.

---

## 8-avgustda tuzatilgan xatolar

Kod yozilgan, lekin hech qachon ishga tushirilmagan edi. Birinchi ishga
tushirishda 6 ta nuqson chiqdi (batafsil: `git log`):

1. `gemini-2.5-flash` / `2.0-flash` — Google yangi kalitlar uchun yopgan
   (404 va free tier `limit: 0`). Bot umuman post yasay olmasdi.
   → `gemini-3.6-flash` → `3.5-flash` → `flash-latest`
2. `maxOutputTokens` 2048 kamlik qilgan — Gemini 3 da "o'ylash" tokenlari
   ham shu limitdan yeydi, JSON yarim uzilardi → 8192
3. Xitoycha ieroglif hashtagda: `#endokrinologiya批判`
4. Model axlati: `#pediatriya_me0000000e00_lower_bounds_range_0_0`
5. Apostroflar aralash: bir postda ham `o'` ham `oʻ`
6. Caption 1024 chegarasi HTML teglarini ham sanardi — uzun AAP havolasi
   tufayli 3-punkt keraksiz o'chib ketardi

## Sinash buyruqlari

```powershell
cd C:\Users\user\boladoc-bot
npm test           # tarmoqsiz testlar
npm run preview    # haqiqiy post yasaydi, out/ ga PNG chiqaradi
npm run check      # Telegram + Gemini + RSS ulanishini tekshiradi
```

`.env` fayli kalitlarni saqlaydi va GitHub'ga **hech qachon** yuklanmaydi.
