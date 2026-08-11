/**
 * Rasm va caption'ni Telegramsiz sinash:
 *   node src/preview.js
 * Natija: out/preview-*.png va konsolda caption matni.
 * GEMINI_API_KEY bo'lsa haqiqiy tarjima ishlatiladi, bo'lmasa namuna matn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, log, formatDateUz, todayId, ROOT } from './util.js';
import { fetchAllFeeds, fetchAbstract } from './feeds.js';
import { selectCandidates } from './relevance.js';
import { generateContent } from './gemini.js';
import { buildImage } from './image.js';
import { buildCaption, visibleLength, CAPTION_LIMIT } from './caption.js';
import { loadPosted } from './state.js';

const SAMPLE = {
  title_uz: 'Chaqaloqlarda RSV profilaktikasi: yangilangan tavsiyalar',
  hook: 'Yangi tavsiyalar bronxiolit bo‘yicha gospitalizatsiya ko‘rsatkichini sezilarli kamaytirishi kutilmoqda.',
  bullets: [
    '🔹 Barcha chaqaloqlar birinchi RSV mavsumida profilaktika olishi tavsiya etiladi.',
    '📊 Klinik sinovlarda kasallik og‘ir kechish xavfi ishonchli darajada pasaygan.',
    '⏱ Profilaktika mavsum boshlanishidan oldin boshlanishi optimal hisoblanadi.',
  ],
  takeaway: 'Ambulator qabulda RSV mavsumi oldidan profilaktika ko‘rsatmalarini oila bilan muhokama qilish tavsiya etiladi.',
  hashtags: ['#pediatriya', '#RSV', '#bronxiolit', '#AAP', '#BoladocAcademy'],
  card_topic: 'PROFILAKTIKA',
  card_title: 'Chaqaloqlarda RSV profilaktikasi bo‘yicha yangilangan tavsiyalar',
  image_prompt:
    'modern flat medical illustration, infant respiratory health, soft teal and white palette, clean minimal, no text, no letters, no logos',
};

async function main() {
  const config = loadConfig();
  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const items = await fetchAllFeeds(config.feeds);
  const { set: posted } = loadPosted();
  const candidates = selectCandidates(items, {
    posted,
    maxAgeDays: config.maxAgeDays,
    limit: config.draftCount,
    extraBlocked: config.blockedExtra ?? [],
    onBlocked: (it, category) => log(`taqiq [${category}]: ${it.title}`),
  });

  if (!candidates.length) {
    log('nomzod topilmadi');
    return;
  }

  for (const [i, item] of candidates.entries()) {
    console.log(`\n─── VARIANT ${'ABC'[i]} ─── [${item.source}] ${item.title}\n${item.link}`);

    let content = SAMPLE;
    if (process.env.GEMINI_API_KEY) {
      const abstract = await fetchAbstract(item.link);
      content = await generateContent(item, abstract, config.brand, process.env.GEMINI_API_KEY);
    } else {
      log('GEMINI_API_KEY yo‘q — namuna matn ishlatilmoqda');
    }

    const caption = buildCaption(content, item, config.brand);
    console.log(`\n--- CAPTION (${visibleLength(caption)}/${CAPTION_LIMIT} ko'rinadigan belgi) ---\n${caption}\n`);

    const png = await buildImage({
      content,
      item,
      dateText: formatDateUz(item.pubDate),
      imageConfig: config.image,
      seed: 1000 + i,
    });
    const file = path.join(outDir, `preview-${todayId()}-${'ABC'[i]}.png`);
    fs.writeFileSync(file, png);
    console.log(`rasm: ${file} (${Math.round(png.length / 1024)} KB)`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
