# HOLAT — 11-avgust 2026

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
| Kod | ✅ ishlaydi, 36 ta test o'tadi (`npm test`) |
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

## 11-avgustda hal qilingan 2 ta savol

### 1. AI rasm — O'CHIRILDI

`config.json` da `"image": { "aiBackground": false }`. Endi faqat toza
brendli gradient kartochka chiziladi. AI rasm bo'lmaganda sarlavha butun
kenglikni egallaydi (`src/image.js` dagi `split` shuni hisobga oladi), post
tezroq yasaladi va sifat har safar bir xil bo'ladi.

Qaytarish uchun shu qiymatni `true` qilish kifoya.

### 2. Taqiqlangan mavzular — QO'SHILDI

`src/relevance.js` dagi `BLOCKED_TOPICS` — 3 ta kategoriya. Bu iboralar
sarlavha yoki tavsifda uchrasa, maqola tanlovga **umuman kirmaydi**:

| Kategoriya | Nima taqiqlangan |
|---|---|
| `gender` | transgender, gender identifikatsiyasi, balog'atni bostiruvchi dorilar, LGBT |
| `zarar` | suitsid, o'z-o'ziga zarar, narkotik, opioid, alkogol, veyp/tamaki |
| `aqsh` | qurol, Medicaid/Medicare, sug'urta siyosati, irqiy tengsizlik, migratsiya |

**Taqiqlanmagan:** reproduktiv salomatlik (HPV emlash, o'smirlar jinsiy
tarbiyasi va h.k.) — foydalanuvchi buni ataylab qoldirdi.

Yangi so'z qo'shish uchun kodga tegish shart emas — `config.json` dagi
`"blockedExtra": []` ga kichik harfda yozing.

⚠️ Ehtiyot: naqshlar substring bo'yicha solishtiriladi. Shuning uchun
yolg'iz `gender` yoki `gun` kabi so'zlar yozilmaydi — ular "gender
farqlari" yoki "begun" ga bexosdan mos kelib, foydali maqolani ham
tashlab yuboradi. Har doim ikki so'zli ibora yozing.

11-avgust sinovida 4207 ta yozuvdan 7 tasi shu filtr bilan tashlandi,
jumladan HOLAT'da eslatilgan transgender maqolasi.

### Ochiq qolgan kichik savol

AAP feedidagi "Achieving Equity in an Age of Artificial Intelligence"
kabi *equity/disparities* mavzusidagi maqolalar hozir o'tib ketyapti —
faqat "racial/ethnic disparity" iboralari taqiqlangan. Agar bular ham
kerak bo'lmasa, `aqsh` ro'yxatiga `health equity`, `health disparit`,
`social determinants` qo'shish kerak.

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
