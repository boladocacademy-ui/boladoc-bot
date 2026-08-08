import { fetchWithRetry, log, truncate, cleanHashtag, fixUzbekApostrophes } from './util.js';

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
    hashtags: { type: 'array', items: { type: 'string' } },
    card_topic: { type: 'string' },
    card_title: { type: 'string' },
    image_prompt: { type: 'string' },
  },
  required: [
    'title_uz', 'hook', 'bullets', 'takeaway',
    'hashtags', 'card_topic', 'card_title', 'image_prompt',
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

QATIY QOIDALAR:
1. FAQAT manbada bor maʼlumotni yoz. Raqam, doza, foiz yoki tavsiyani O'ZINGDAN TO'QIMA.
2. Manbada aniq raqam bo'lmasa — umumiy xulosa yoz, taxminiy raqam yozma.
3. Tibbiy atamalarni o'zbekcha qabul qilingan shaklda ber, qavs ichida inglizchasini qoldir.
   Masalan: "bronxiolit (bronchiolitis)", "immunizatsiya jadvali (immunization schedule)".
4. Uslub: professional, ishonchli, klikbeytsiz. "Shok!", "Hammasi o'zgardi!" kabi arzon iboralar TAQIQLANADI.
5. Emoji ishlatiladi, lekin o'lchov bilan — har bulletda 1 ta, jami 6-8 tadan oshmasin.
6. O'zbek lotin yozuvida oʻ va gʻ harflarini to'g'ri yoz.

QAYTARADIGAN MAYDONLAR:
- title_uz: post sarlavhasi, o'zbekcha, 90 belgidan oshmasin, emojisiz.
- hook: 1 ta jumla — nega bu shifokor uchun muhim. 140 belgigacha.
- bullets: aynan 3 ta punkt. Har biri 1 emoji bilan boshlanadi, 120 belgigacha. Asosiy topilmalar.
- takeaway: "Amaliyotga nima beradi" — 1-2 jumla, 170 belgigacha, emojisiz.
- hashtags: 5 ta hashtag, o'zbekcha yoki inglizcha, # bilan, bo'sh joysiz. Masalan ["#pediatriya","#AAP"].
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
      const out = normalize(await callGemini(model, apiKey, prompt), item);

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
function normalize(raw, item = {}) {
  const uz = (s, max) => truncate(fixUzbekApostrophes(String(s ?? '')), max);

  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .map((b) => uz(b, 140))
    .filter(Boolean)
    .slice(0, 3);

  // Buzuq hashtaglar tashlab yuborilgach post tagsiz qolmasligi uchun zaxira.
  const fallbackTags = ['#pediatriya', cleanHashtag(item.source || ''), '#BoladocAcademy'];
  const hashtags = [
    ...new Set(
      [...(Array.isArray(raw.hashtags) ? raw.hashtags : []), ...fallbackTags]
        .map(cleanHashtag)
        .filter(Boolean),
    ),
  ].slice(0, 5);

  return {
    title_uz: uz(raw.title_uz, 100),
    hook: uz(raw.hook, 160),
    bullets,
    takeaway: uz(raw.takeaway, 190),
    hashtags,
    card_topic: truncate(String(raw.card_topic || '').toUpperCase(), 24),
    card_title: uz(raw.card_title, 70),
    // image_prompt inglizcha — apostrof tuzatish qo'llanmaydi.
    image_prompt: truncate(raw.image_prompt, 400),
  };
}
