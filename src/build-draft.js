/**
 * 21:00 (Toshkent) — ertangi post variantlarini tayyorlab, adminga tasdiqlashga yuboradi.
 * Kanalga HECH NARSA chiqmaydi.
 */
import { loadConfig, log, todayId, formatDateUz, truncate } from './util.js';
import { fetchAllFeeds, fetchAbstract } from './feeds.js';
import { selectCandidates } from './relevance.js';
import { generateContent } from './gemini.js';
import { buildImage } from './image.js';
import { buildCaption } from './caption.js';
import { sendPhoto, sendMessage, getUpdates, confirmUpdates } from './telegram.js';
import { loadPosted, saveDraft } from './state.js';

const DRY_RUN = process.argv.includes('--dry-run');

const LABELS = ['A', 'B', 'C'];

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

async function main() {
  const config = loadConfig();
  const draftId = todayId();

  log(`draft qurilmoqda — draftId=${draftId}, dry-run=${DRY_RUN}`);

  const items = await fetchAllFeeds(config.feeds);
  log(`jami ${items.length} ta yozuv olindi`);
  if (!items.length) throw new Error('Hech qaysi manbadan yozuv olinmadi');

  const { set: posted } = loadPosted();
  const candidates = selectCandidates(items, {
    posted,
    maxAgeDays: config.maxAgeDays,
    limit: config.draftCount,
  });

  if (!candidates.length) {
    const msg = '⚠️ Bugun yangi mos maqola topilmadi (hammasi allaqachon chiqarilgan).';
    log(msg);
    if (!DRY_RUN) {
      await sendMessage(env('TELEGRAM_BOT_TOKEN'), env('ADMIN_CHAT_ID'), msg);
    }
    saveDraft({ draftId, createdAt: new Date().toISOString(), status: 'empty', options: [] });
    return;
  }

  log(`tanlangan nomzodlar:\n${candidates.map((c, i) => `  ${LABELS[i]}. [${c.source}] ${c.title}`).join('\n')}`);

  if (DRY_RUN) {
    log('dry-run: Gemini/Telegram chaqirilmaydi. Manbalar va tanlov ishlayapti.');
    return;
  }

  const token = env('TELEGRAM_BOT_TOKEN');
  const adminChat = env('ADMIN_CHAT_ID');
  const geminiKey = env('GEMINI_API_KEY');

  // Eski javoblarni navbatdan tozalaymiz — aks holda kechagi tugma bugungi
  // tekshiruvda aralashib ketishi mumkin.
  try {
    const old = await getUpdates(token);
    if (old.length) await confirmUpdates(token, old[old.length - 1].update_id);
  } catch (err) {
    log(`eski yangilanishlar tozalanmadi: ${err.message}`);
  }

  await sendMessage(
    token,
    adminChat,
    `🌙 <b>Ertangi post uchun ${candidates.length} ta variant</b>\n` +
      `Sana: ${formatDateUz(new Date().toISOString())}\n\n` +
      `Quyidagilardan birini tugma orqali tasdiqlang. ` +
      `Tasdiqlangan post ertaga <b>08:00</b> da kanalga chiqadi.\n` +
      `Hech narsa tanlanmasa — post chiqmaydi.`,
  );

  const options = [];

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const label = LABELS[i];
    try {
      log(`[${label}] abstrakt olinmoqda: ${item.link}`);
      const abstract = await fetchAbstract(item.link);

      log(`[${label}] Gemini matn tayyorlamoqda`);
      const content = await generateContent(item, abstract, config.brand, geminiKey);

      log(`[${label}] rasm tayyorlanmoqda`);
      const png = await buildImage({
        content,
        item,
        dateText: formatDateUz(item.pubDate),
        imageConfig: config.image,
        seed: Math.abs(hashCode(item.key + draftId)) % 1_000_000,
      });

      const caption = buildCaption(content, item, config.brand);

      const sent = await sendPhoto(
        token,
        adminChat,
        png,
        `<b>━━━ VARIANT ${label} ━━━</b>\n\n${caption}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: `✅ ${label} variantni tasdiqlash`, callback_data: `ok:${draftId}:${i}` }],
              [{ text: '❌ Bugun post chiqmasin', callback_data: `no:${draftId}` }],
            ],
          },
        },
      );

      const fileId = sent.photo?.[sent.photo.length - 1]?.file_id;
      if (!fileId) throw new Error('Telegram file_id qaytarmadi');

      options.push({
        index: i,
        label,
        key: item.key,
        title: item.title,
        titleUz: content.title_uz,
        link: item.link,
        source: item.source,
        sourceFull: item.sourceFull,
        pubDate: item.pubDate,
        caption,
        fileId,
        adminMessageId: sent.message_id,
      });
      log(`[${label}] adminga yuborildi`);
    } catch (err) {
      log(`[${label}] XATO: ${err.message}`);
      await sendMessage(
        token,
        adminChat,
        `⚠️ <b>Variant ${label} tayyorlanmadi</b>\n${truncate(err.message, 300)}`,
      ).catch(() => {});
    }
  }

  saveDraft({
    draftId,
    createdAt: new Date().toISOString(),
    status: options.length ? 'pending' : 'failed',
    options,
  });

  if (!options.length) throw new Error('Hech qaysi variant tayyorlanmadi');
  log(`draft saqlandi: ${options.length} ta variant`);
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
