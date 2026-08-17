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
| Tasdiq soniyalarda ishlanadi | `.github/workflows/watch.yml` → `npm run watch` |

Arxiv 11–13 avgustdagi 6 ta variant bilan git tarixidan to'ldirilgan,
shuning uchun Telegramdagi eski xabarlar ham ishlaydi.

`state/queue.json` maydonlari: `items` (navbat), `skipNext` ("keyingi post
chiqmasin" tugmasi), `handledOn` (bugun hal qilinganmi — jadval kechikib
ikkinchi marta ishga tushsa, ikkita post ketib qolmasligi uchun).

## 14-avgust: GitHub croni ishonchsiz ekani o'lchandi

**Birinchi post kanalga chiqdi** (14-avgust, qo'lda): nirsevimab / RSV,
JAMA Pediatrics. `state/posted.json` endi bo'sh emas.

Lekin 13-avgustda bosilgan tugmaga javob kelmagan. Sabab o'lchandi:

| Cron | Kutilgan | Haqiqatda |
|---|---|---|
| `*/15` (tasdiq tekshiruvi) | 21 soatda ~84 marta | **5 marta** (94% tashlandi) |
| `0 16` (draft) | 16:00 UTC | 19:47 UTC (3s 47d kech) |
| `07 2` (publish) | 02:07 UTC | 06:57 UTC (4s 50d kech) |

Xulosa: **GitHub'ning qisqa oraliqli cronlari deyarli bajarilmaydi.**
Shuning uchun tugma bosilganda hech qanday javob kelmasdi.

Telegram tomonidan yechim yo'qligi ham amalda sinaldi:
```
schedule_date                        -> e'tiborsiz qoladi, xabar DARHOL ketadi
suggested_post_parameters.send_date  -> "only to channel direct messages"
```
Bot API kelajakka rejalashtira olmaydi (ilovadagi "scheduled" faqat odam
akkaunti uchun).

### Qilingan ish

1. **`watch.yml` — uzluksiz kuzatuv.** `check.yml` o'chirildi. Endi bitta
   ish 55 daqiqa turadi va Telegramni long polling bilan tinglaydi; tugma
   bosilishi **soniyalarda** ishlanadi. Soatlik cron navbatdagisini
   boshlaydi — u kechiksa ham eng yomoni bir necha daqiqalik uzilish.
   Public repoda Actions daqiqalari cheksiz, ya'ni bepul.
   Alohida concurrency guruhi (`boladoc-watch`) — draft/publish ni
   kutib qoldirmaydi. Telegram 409 qaytarsa watch.js yo'l beradi.

2. **Bosish endi izsiz yo'qolmaydi.** Ilgari tugma bosilib, post navbatga
   tushmasa (masalan variant arxivda topilmasa), `confirmUpdates` uni
   Telegram navbatidan o'chirib yuborardi va hech kim bilmay qolardi.
   Endi har bunday holatda oddiy xabar yuboriladi — `answerCallback`
   eskirgan bosish uchun ishlamasligi mumkin, xabar esa har doim yetadi.

3. **publish tasdiqni har doim o'qiydi** — `handledOn` tekshiruvidan
   OLDIN. Ilgari erta qaytib ketsa, bosilgan tugma navbatda qolib
   24 soatdan keyin o'chib ketardi.

## 17-avgust: nega kuniga bitta variant chiqardi

15, 16 va 17-avgustda draft **bitta** variant yasadi va uch kun ketma-ket
bir xil maqolani taklif qildi. O'lchandi:

| Nomzod zaxirasi | Abstrakti yetarli |
|---|---|
| 6 ta (eski sozlama) | **1 ta** |
| 20 ta | 4 ta |

Sabab: jurnal feedlarining katta qismi muharrirga xatlar, izohlar va
tuzatishlar — ularda abstrakt umuman yo'q, `MIN_ABSTRACT = 400` ni
o'tolmaydi. Zaxira `draftCount + 4` = 6 ta edi.

Qilingan ish:

| Nima | Qayerda |
|---|---|
| Zaxira 20 taga oshirildi | `config.json` → `candidatePool` |
| Bir xil sarlavha bir marta olinadi (xat + javob 2-3 marta chiqadi) | `relevance.js` → `titleKey` |
| Tasdiqlanmagan maqola ertasiga oxirga suriladi | `state.js` → `offeredKeys`, `selectCandidates(deprioritize)` |
| `draftId` ga soat-daqiqa qo'shildi | `build-draft.js` → `makeDraftId()` |
| Kam variant chiqsa sababi Telegramga yoziladi | `build-draft.js` oxiri |

`draftId` ni o'zgartirish sababi: faqat sana bo'lganda, bir kunda ikkinchi
marta ishlagan draft arxivdagi birinchisining yozuvlari ustiga yozardi va
ertalabki tugma bosilganda navbatga **boshqa maqola** tushardi.

## 17-avgust: bir yillik arxiv (Europe PMC)

`maxAgeDays` ni oshirish **hech narsa bermaydi** — o'lchandi: 45 kun ham,
365 kun ham 41 ta nomzod berdi. Chegara sana emas, RSS feedining o'zi:
AAP 7 ta, JAMA 56 ta yozuv beradi, tamom.

Shuning uchun yangi manba qo'shildi: **`src/archive.js`** — Europe PMC
qidiruvi, 10 ta pediatriya jurnali, oxirgi 12 oy (2330 ta maqola).

| Ustunligi | Nima beradi |
|---|---|
| `HAS_ABSTRACT:Y` | Abstrakti yo'q maqola qidiruvga tushmaydi — "kuniga bitta variant" muammosining ildizi shu edi |
| Abstrakt javob ichida | Alohida so'rov kerak emas, tezroq va ishonchli |
| Bepul, kalitsiz | Xarajat yo'q |

Diqqat qilinadigan joylar:

- **Sahifalash `cursorMark` bilan.** `page` parametri Europe PMC'da
  e'tiborsiz qoladi — o'lchandi: 1, 2, 3-sahifalar aynan bir xil 100 ta
  natija qaytardi. Endi 3 sahifa = 300 ta maqola.
- **Sarlavha bo'yicha dedupe majburiy.** Bitta maqola RSS'da `2852670`,
  arxivda `pmid:42603200` kaliti bilan keladi. Faqat kalitga tayanilsa,
  kanalga chiqqan maqola ikkinchi marta chiqib ketardi.
- **Yangilik bali `maxAgeDays` ga bog'lanmaydi** (`FRESH_DAYS = 60`).
  Aks holda oyna bir yilga ochilganda eski maqola bugungisini bosib
  ketishi mumkin edi.
- **Taqiq filtriga abstraktning faqat boshi (300 belgi) beriladi.**
  To'liq abstrakt berilsa, yo'l-yo'lakay eslatilgan omil ("maternal
  smoking" kabi) butun maqolani tashlab yuborardi.

O'chirish kerak bo'lsa: `config.json` → `"archive": { "enabled": false }`.

## Bot qayerda ishlaydi

O'z serveri **yo'q**, hech narsa sotib olinmagan.

| Nima | Qayerda | Narx |
|---|---|---|
| Kod ishga tushishi | GitHub Actions, `ubuntu-latest` (GitHub'ning serveri) | bepul (public repo — cheksiz daqiqa) |
| Kod va holat (`state/*.json`) | github.com/boladocacademy-ui/boladoc-bot | bepul |
| Kalitlar | GitHub Secrets (4 ta) | — |
| Matn tayyorlash | Google Gemini API | bepul tier |
| Maqolalar | RSS + Europe PMC (EBI, Britaniya) | bepul |
| Post yuborish | Telegram Bot API | bepul |

Lokal nusxa: `C:\Users\user\boladoc-bot` (`.env` shu yerda, GitHub'ga
hech qachon yuklanmaydi). Kompyuter o'chiq bo'lsa ham bot ishlaydi —
lokal nusxa faqat qo'lda sinash uchun.

Ma'lumotlar bazasi yo'q: holat oddiy JSON fayllarda va bot ularni har
ishdan keyin repoga commit qiladi (`git log` da "publish: …", "draft: …"
degan commitlar — ularni bot yozgan).

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
npm run approvals  # bosilgan tugmalarni o'qib navbatga qo'shadi
npm run preview    # haqiqiy post yasaydi, out/ ga PNG chiqaradi
npm run check      # Telegram + Gemini + RSS ulanishini tekshiradi
```

`.env` fayli kalitlarni saqlaydi va GitHub'ga **hech qachon** yuklanmaydi.
