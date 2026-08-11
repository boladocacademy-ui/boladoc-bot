import { fetchWithRetry, log, truncate, fixUzbekApostrophes } from './util.js';

// Birinchisi ishlamasa keyingisiga o'tadi. gemini-2.5/2.0 olib tashlandi:
// Google ularni yangi kalitlar uchun yopgan (404 / free tier limit: 0).
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title_uz: { type: 'string' },
    hook: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    takeaway: { type: 'string' },
    card_topic: { type: 'string' },
    card_title: { type: 'string' },
    image_prompt: { type: 'string' },
  },
  required: [
    'title_uz', 'hook', 'bullets', 'takeaway',
    'card_topic', 'card_title', 'image_prompt',
  ],
};

function buildPrompt(item, abstract, brand) {
  return `Sen xalqaro darajadagi tibbiy kontent-marketolog va pediatr-tarjimonsan.
Telegram kanali: "${brand.name}" (${brand.handle}).
AUDITORIYA: faqat shifokorlar, ordinatorlar va tibbiyot talabalari. Ular professional atamalarni tushunadi.

VAZIFA: quyidagi ingliz tilidagi manbani O'ZBEK TILIGA (lotin alifbosi) moslashtirib, Telegram post matnini tayyorla.

MANBA: ${item.sourceFull}
SANA: ${item.pubDate || 'nomaʼlum'}
SARLAVHA: ${item.title}
QISQACHA: ${truncate(abstract || item.description, 2500)}

ENG MUHIM QOIDA — NATIJA YOZ:
Shifokorni tadqiqot "o'tkazildi" yoki "baholandi" degani QIZIQTIRMAYDI. Uni
NATIJA qiziqtiradi: nima chiqdi, qancha, ishladimi yoki yo'q.
- "Deksametazon tomchilari o'rganildi" — YOMON, bu hech narsa aytmaydi.
- "Deksametazon tomchilari 1-tur ROP ga o'tishni 12% dan 5% ga tushirdi" — YAXSHI.
Manbadagi Results va Conclusions bo'limlari — postning asosi. Raqamlar,
taqqoslashlar, ishonch oralig'i bo'lsa — ularni albatta ishlat.
Agar manbada natija umuman bo'lmasa, "natija hali eʼlon qilinmagan" deb ochiq yoz —
lekin natijani O'ZINGDAN TO'QIMA.

QATIY QOIDALAR:
1. FAQAT manbada bor maʼlumotni yoz. Raqam, doza, foizni O'ZINGDAN TO'QIMA.
2. USLUB: tirik, tabiiy, hamkasbga gapirgandek. Rasmiy hisobot tili EMAS.
   - "...samaradorligi baholandi", "...o'tkazildi", "...o'rganildi" kabi
     shaxssiz kanselyar iboralardan QOCH.
   - Faol nisbatda yoz: "tomchilar xavfni kamaytirdi", "farq chiqmadi".
   - Bir vaqtda klikbeytdan ham qoch: "Shok!", "Hammasi o'zgardi!" TAQIQLANADI.
     Ohang — bilimdon hamkasb, na quruq byurokrat, na bozor savdogari.
3. QISQARTMALAR: xalqaro qisqartmani o'zbekchaga aylantirma (ROP, RSV, ADHD
   shundayligicha qoladi — shifokorlar adabiyotni shu nom bilan qidiradi).
   Lekin BIRINCHI marta uchraganda ochib ber:
   "chala tug'ilganlar retinopatiyasi (retinopathy of prematurity, ROP)".
   Keyingi joylarda faqat "ROP" deb yoz — takrorlayverma.
4. INGLIZCHA SO'ZLARNI AYNAN KO'CHIR. Qavs ichidagi inglizcha atamani manbadan
   harfma-harf ol, quloqqa qarab yozma.
   Masalan "prethreshold" — "pretreshold" EMAS.
   O'zbekcha muqobili bo'lmasa, inglizchasini qavsda qoldir.
5. Emoji o'lchov bilan — har bulletda 1 ta, jami 6-8 tadan oshmasin.
6. O'zbek lotin yozuvida oʻ va gʻ harflarini to'g'ri yoz.
7. STATISTIK ISHONCHLILIK. Agar natija ishonchli bo'lmasa — ya'ni P > 0.05,
   yoki ishonch oralig'i (CI) 1 ni kesib o'tsa, yoki manbada "did not reach
   statistical significance" / "numerically reduced" deyilsa — buni AYNAN
   o'sha punktning ichida ayt.
   "Kamaytirdi" deb qat'iy yozma. To'g'risi: "kamaydi, lekin farq statistik
   ishonchli emas (P=0.08)". Shifokor punktni yolg'iz o'qiganda ham
   adashmasligi kerak.

QAYTARADIGAN MAYDONLAR:
- title_uz: post sarlavhasi, o'zbekcha, 100 belgigacha, emojisiz.
  Iloji bo'lsa natijani yoki asosiy savolni ko'rsat. Quruq nom qo'yma:
  "Deksametazon tomchilari" EMAS — "Deksametazon tomchilarining ROP profilaktikasidagi o'rni"
  yoki undan ham yaxshisi natijani aytadigan sarlavha.
- hook: 1 ta jumla — nega bu shifokor uchun muhim. 140 belgigacha.
- bullets: aynan 3 ta punkt, har biri 1 emoji bilan boshlanadi, 120 belgigacha.
  1-punkt: asosiy NATIJA (raqam bilan bo'lsa yaxshi).
  2-punkt: kimda o'tkazilgan — populyatsiya, hajm, dizayn (qisqa).
  3-punkt: qo'shimcha topilma, cheklov yoki xavfsizlik maʼlumoti.
- takeaway: "Amaliyotga nima beradi" — 1-2 jumla, 180 belgigacha, emojisiz.
  Bu yerda "o'rganildi" deb yozish TAQIQLANADI. Aniq ayt: shifokor endi nima
  qilsin yoki nimani hisobga olsin. Natija amaliyotni o'zgartirmasa —
  "hozircha amaliyotni o'zgartirmaydi, chunki..." deb rostini yoz.
- card_topic: rasm ustidagi kichik yorliq — 1-2 so'z, BOSH HARFLARDA, 24 belgigacha. Masalan "VAKSINATSIYA".
- card_title: rasm ustidagi katta sarlavha — o'zbekcha, 60 belgidan oshmasin, emojisiz.
- image_prompt: INGLIZ TILIDA rasm generatori uchun tavsif. Toza, zamonaviy, professional tibbiy illyustratsiya.
  Muhim: rasmda MATN, harf, raqam, logotip BO'LMASIN. Haqiqiy bemor fotosurati bo'lmasin.
  Uslub: "modern flat medical illustration, soft teal and white palette, clean, no text, no letters".`;
}

async function callGemini(model, apiKey, prompt) {
  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.55,
          // Gemini 3 modellarida "o'ylash" tokenlari ham shu limitdan yeydi.
          // 2048 da JSON yarim uzilib qolardi ("Unterminated string").
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      timeoutMs: 90_000,
    },
    2,
  );

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text.trim()) {
    throw new Error(`Gemini bo'sh javob qaytardi (${JSON.stringify(data).slice(0, 300)})`);
  }
  return JSON.parse(text);
}

export async function generateContent(item, abstract, brand, apiKey) {
  const prompt = buildPrompt(item, abstract, brand);
  let lastErr;
  let fallback = null; // to'liq bo'lmagan, lekin ishlatsa bo'ladigan natija

  for (const model of MODELS) {
    try {
      const out = normalize(await callGemini(model, apiKey, prompt));

      // Model ba'zan 3 ta o'rniga 2 ta punkt qaytaradi. Bu post to'liq
      // ko'rinmasligiga olib keladi, shuning uchun keyingi modelni sinaymiz —
      // lekin bori ham yo'qdan yaxshi, shuning uchun zaxiraga saqlab qo'yamiz.
      if (out.bullets.length < 3 || !out.title_uz || !out.takeaway) {
        log(`gemini to'liqmas (${model}): ${out.bullets.length} ta punkt — keyingisi sinaladi`);
        fallback ??= out;
        continue;
      }

      log(`gemini ok: ${model}`);
      return out;
    } catch (err) {
      lastErr = err;
      log(`gemini xato (${model}): ${err.message}`);
    }
  }

  if (fallback) {
    log('gemini: to\'liqmas natija ishlatilmoqda');
    return fallback;
  }
  throw new Error(`Gemini ishlamadi: ${lastErr?.message}`);
}

/** Model chegaralarni ba'zan buzadi — bu yerda majburan kesamiz. */
function normalize(raw) {
  const uz = (s, max) => truncate(fixUzbekApostrophes(String(s ?? '')), max);

  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .map((b) => uz(b, 140))
    .filter(Boolean)
    .slice(0, 3);

  return {
    title_uz: uz(raw.title_uz, 110),
    hook: uz(raw.hook, 160),
    bullets,
    takeaway: uz(raw.takeaway, 200),
    card_topic: truncate(String(raw.card_topic || '').toUpperCase(), 24),
    card_title: uz(raw.card_title, 70),
    // image_prompt inglizcha — apostrof tuzatish qo'llanmaydi.
    image_prompt: truncate(raw.image_prompt, 400),
  };
}
