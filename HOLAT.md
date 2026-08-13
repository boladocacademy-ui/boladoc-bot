# HOLAT — 13-avgust 2026

Bu fayl ishni to'xtatgan joyni eslatib turadi. Yangi suhbat boshlaganda
avval shuni o'qing.

## Ishni qanday davom ettirish

Claude Code suhbatlarni **ish papkasi bo'yicha** ajratadi, shuning uchun
`/resume` ro'yxati qaysi papkadan boshlaganingizga bog'liq:

| Suhbat | Qaysi papkadan boshlash kerak |
|---|---|
| 3-8 avgust (bot yozilgan kunlar) | `cd C:\Users\user` |
| 11-avgust (taqiq filtri, GitHub'ga yuklash) | `cd "C:\Users\user\Desktop\Fathulla Don't Touch"` |

Eski suhbat topilmasa — yo'qolgan emas, shunchaki boshqa papkaga tegishli.

---

## Nima tayyor

Quvur boshdan oxirigacha sinaldi va ishlaydi:

```
RSS (5 manba) → pediatriya filtri → Gemini tarjima → rasm → caption
```

| Qism | Holat |
|---|---|
| Kod | ✅ ishlaydi, 61 ta test o'tadi (`npm test`) |
| Telegram bot | ✅ @Boladocacademymanagerbot |
| Kanal | ✅ @Boladoc_uz (ID `-1003114000709`, 1548 obunachi) |
| Bot kanalda admin | ✅ `can_post_messages: true` |
| ADMIN_CHAT_ID | ✅ `8364248980` |
| Gemini kaliti | ✅ ishlaydi, `.env` faylida |
| Lokal sinov | ✅ `npm run preview` haqiqiy post yasaydi |
| Bot tokeni | ✅ 11-avgustda BotFather orqali `/revoke` qilinib almashtirildi |
| `.env` | ✅ 4 ta kalit ham joyida; lokal buyruqlar uni o'zi o'qiydi |
| GitHub repo | ✅ https://github.com/boladocacademy-ui/boladoc-bot (Public) |
| GitHub Secrets | ✅ 4 tasi qo'shilgan |
| Workflow permissions | ✅ Read and write (bot `state/` ni commit qila oladi) |
| GitHub Actions sinovi | ✅ 11-avgust: "1) Draft tayyorlash" qo'lda ishga tushirilib, 2 ta variant Telegramga yetib bordi |

**Kanalga hali BIRORTA post chiqmagan.** `state/posted.json` bo'sh.

## 13-avgustda: NAVBAT tizimi

**Muammo.** 12 va 13-avgustda post chiqmadi. Sabab kod xatosi emas edi:
tugma ichida o'sha kungi `draftId` yozilgan, publish esa faqat o'sha
kunning tugmasini qabul qilardi. Foydalanuvchi 11-avgustdagi eski
xabardagi tugmani bosdi — bot uni jimgina tashlab yubordi, hech kimga
xabar bermay.

**Yechim — navbat (queue).** Endi tasdiq darhol chiqmaydi, `state/queue.json`
ga tushadi. Har kuni 08:00 da navbat boshidagi **bitta** post chiqadi.

| Nima o'zgardi | Qayerda |
|---|---|
| Istalgan kundagi tugma ishlaydi | `state/options.json` — yuborilgan 60 ta variant arxivi |
| Bir kunda bir nechta variant tasdiqlash mumkin | `src/approvals.js` → `enqueue()` |
| Bir maqola ikki marta chiqmaydi | `enqueue()` `posted` va navbatni tekshiradi |
| Tugma bosilganda ekranda javob chiqadi | `answerCallback` — "✅ Navbatga qo'shildi — 2-o'rin" |
| Bosilgan tugma yo'qolmaydi | `harvestApprovals()` draftda ham, publishda ham chaqiriladi |
| Navbatdagi maqola qayta taklif qilinmaydi | `build-draft.js` — `taken = posted ∪ queue` |

Arxiv 11–13 avgustdagi 6 ta variant bilan git tarixidan to'ldirilgan,
shuning uchun Telegramdagi eski xabarlar ham ishlaydi.

`state/queue.json` maydonlari: `items` (navbat), `skipNext` ("keyingi post
chiqmasin" tugmasi), `handledOn` (bugun hal qilinganmi — jadval kechikib
ikkinchi marta ishga tushsa, ikkita post ketib qolmasligi uchun).

## Jadval kechikishi

GitHub'ning bepul croni kechikadi. Kuzatilgani: draft `16:00 UTC` ga
qo'yilgan, haqiqatda `19:47` da ishlagan (~3 soat 45 daqiqa).

Qilingan chora:
- cron daqiqalari soat boshidan olib tashlandi: draft `11 16`, publish `07 2`
- publishga zaxira cron qo'shildi: `13 4` — birinchisi ishlagan bo'lsa,
  ikkinchisi `handledOn` tufayli hech narsa qilmaydi
- `MAX_WAIT_MS` 70 daqiqaga oshirildi (02:07 → 03:00 gacha kutish uchun)

## Keyingi qadam

Telegramda yoqqan variantlarni tugma bilan tasdiqlash — nechtasini
xohlasangiz. Ular ketma-ket kunlarda chiqadi. Kutmasdan sinash uchun:
GitHub → Actions → **2) Kanalga chiqarish** → Run workflow.

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
