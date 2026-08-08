import { fetchWithRetry, log, truncate } from './util.js';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

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
          maxOutputTokens: 2048,
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

  for (const model of MODELS) {
    try {
      const out = await callGemini(model, apiKey, prompt);
      log(`gemini ok: ${model}`);
      return normalize(out);
    } catch (err) {
      lastErr = err;
      log(`gemini xato (${model}): ${err.message}`);
    }
  }
  throw new Error(`Gemini ishlamadi: ${lastErr?.message}`);
}

/** Model chegaralarni ba'zan buzadi — bu yerda majburan kesamiz. */
function normalize(raw) {
  const bullets = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .map((b) => truncate(String(b), 140))
    .filter(Boolean)
    .slice(0, 3);

  const hashtags = (Array.isArray(raw.hashtags) ? raw.hashtags : [])
    .map((h) => String(h).trim().replace(/\s+/g, ''))
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .filter((h) => h.length > 1)
    .slice(0, 5);

  return {
    title_uz: truncate(raw.title_uz, 100),
    hook: truncate(raw.hook, 160),
    bullets,
    takeaway: truncate(raw.takeaway, 190),
    hashtags,
    card_topic: truncate(String(raw.card_topic || '').toUpperCase(), 24),
    card_title: truncate(raw.card_title, 70),
    image_prompt: truncate(raw.image_prompt, 400),
  };
}
