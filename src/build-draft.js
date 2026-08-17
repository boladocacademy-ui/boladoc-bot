/**
 * 21:00 (Toshkent) — ertangi post variantlarini tayyorlab, adminga tasdiqlashga yuboradi.
 * Kanalga HECH NARSA chiqmaydi.
 */
import { loadConfig, log, todayId, formatDateUz, truncate } from './util.js';
import { fetchAllFeeds, fetchAbstract, MIN_ABSTRACT } from './feeds.js';
import { selectCandidates } from './relevance.js';
import { generateContent } from './gemini.js';
import { buildImage } from './image.js';
import { buildCaption } from './caption.js';
import { sendPhoto, sendMessage } from './telegram.js';
import {
  loadPosted,
  saveDraft,
  loadDraft,
  loadQueue,
  archiveOptions,
  offeredKeys,
} from './state.js';
import { harvestApprovals } from './approvals.js';

const DRY_RUN = process.argv.includes('--dry-run');

const LABELS = ['A', 'B', 'C'];

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

/**
 * draftId tugma ichiga yoziladi va arxiv kaliti bo'lib xizmat qiladi. Faqat
 * sana bo'lsa, bir kunda ikki marta ishlaganda (jadval + qo'lda) ikkinchi run
 * arxivdagi birinchisining yozuvlari ustiga yozib yuboradi — ertalabki tugma
 * bosilganda navbatga butunlay boshqa maqola tushardi. Soat-daqiqa qo'shamiz.
 */
function makeDraftId() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${todayId()}-${hh}${mm}`;
}

async function main() {
  const config = loadConfig();
  const draftId = makeDraftId();

  log(`draft qurilmoqda — draftId=${draftId}, dry-run=${DRY_RUN}`);

  // Kun davomida bosilgan tugmalarni AVVAL yig'ib olamiz. Bu qadam tashlab
  // ketilsa, tasdiq Telegram navbatida qolib ketardi va keyingi tozalashda
  // yo'qolardi.
  if (!DRY_RUN) {
    const harvest = await harvestApprovals(
      env('TELEGRAM_BOT_TOKEN'),
      env('ADMIN_CHAT_ID'),
      loadDraft(),
    );
    if (harvest.added.length) {
      log(`draftdan oldin ${harvest.added.length} ta tasdiq navbatga olindi`);
    }
  }

  const items = await fetchAllFeeds(config.feeds);
  log(`jami ${items.length} ta yozuv olindi`);
  if (!items.length) throw new Error('Hech qaysi manbadan yozuv olinmadi');

  const { set: posted } = loadPosted();
  const queue = loadQueue();
  // Navbatda turgan maqola qayta taklif qilinmasin.
  const taken = new Set([...posted, ...queue.items.map((i) => i.key)]);
  const blocked = [];
  // Zaxira KATTA bo'lishi kerak. O'lchandi (17-avgust): 20 ta nomzoddan faqat
  // 4 tasining abstrakti yetarli edi — jurnal feedlarining ko'p qismi xat,
  // izoh va tuzatishlar bo'lib, ularda abstrakt umuman yo'q. Zaxira 4 ta
  // bo'lganda kuniga bitta variant chiqib qolardi.
  const pool = Math.max(config.candidatePool ?? 20, config.draftCount + 4);
  const candidates = selectCandidates(items, {
    posted: taken,
    maxAgeDays: config.maxAgeDays,
    limit: pool,
    extraBlocked: config.blockedExtra ?? [],
    onBlocked: (it, category) => blocked.push(`  [${category}] ${it.title}`),
    // Kechagi tasdiqlanmagan maqola bugun ham birinchi bo'lib chiqmasin.
    deprioritize: offeredKeys(),
  });

  if (blocked.length) {
    log(`taqiqlangan mavzu tufayli ${blocked.length} ta maqola tashlandi:\n${blocked.join('\n')}`);
  }

  if (!candidates.length) {
    const msg = '⚠️ Bugun yangi mos maqola topilmadi (hammasi allaqachon chiqarilgan).';
    log(msg);
    if (!DRY_RUN) {
      await sendMessage(env('TELEGRAM_BOT_TOKEN'), env('ADMIN_CHAT_ID'), msg);
    }
    saveDraft({ draftId, createdAt: new Date().toISOString(), status: 'empty', options: [] });
    return;
  }

  // draftCount tadan keyingilari — zaxira: abstrakti topilmagani o'tkazib
  // yuborilsa, o'rniga shulardan biri chiqadi.
  log(`tanlangan nomzodlar:\n${candidates
    .map((c, i) => `  ${i < config.draftCount ? `${LABELS[i]}.` : 'zaxira'} [${c.source}] ${c.title}`)
    .join('\n')}`);

  if (DRY_RUN) {
    log('dry-run: Gemini/Telegram chaqirilmaydi. Manbalar va tanlov ishlayapti.');
    return;
  }

  const token = env('TELEGRAM_BOT_TOKEN');
  const adminChat = env('ADMIN_CHAT_ID');
  const geminiKey = env('GEMINI_API_KEY');

  const inQueue = loadQueue().items.length;
  await sendMessage(
    token,
    adminChat,
    `🌙 <b>Bugungi variantlar</b> (${config.draftCount} tagacha)\n` +
      `Sana: ${formatDateUz(new Date().toISOString())}\n\n` +
      `Yoqqanini tugma orqali tasdiqlang. Tasdiqlangan post <b>navbatga</b> tushadi, ` +
      `har kuni ertalab <b>08:00</b> da navbatdan bittasi kanalga chiqadi.\n\n` +
      `✅ Bir nechtasini tanlash mumkin — A ham, B ham yoqsa ikkalasini bosing, ` +
      `ular ketma-ket kunlarda chiqadi.\n` +
      `🕰 <b>Eski xabarlardagi tugmalar ham ishlaydi</b> — o‘tgan kunlarda ` +
      `yoqqan variantni istalgan payt bosishingiz mumkin.\n\n` +
      `📥 Hozir navbatda: <b>${inQueue}</b> ta post.`,
  );

  const options = [];
  const skipped = [];

  for (const item of candidates) {
    if (options.length >= config.draftCount) break;
    const i = options.length;
    const label = LABELS[i];
    try {
      log(`[${label}] abstrakt olinmoqda: ${item.link}`);
      const abstract = await fetchAbstract(item.link, item.title);

      // Abstraktsiz post natijani ayta olmaydi — "tadqiqot o'tkazildi" dan
      // nariga o'tmaydi. Bunday maqolani chiqargandan ko'ra keyingisiga o'tamiz.
      if (abstract.length < MIN_ABSTRACT) {
        log(`[${label}] abstrakt yetarli emas (${abstract.length} belgi) — o'tkazib yuborildi: ${item.title}`);
        skipped.push(item.title);
        continue;
      }

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
              [{ text: `✅ ${label} — navbatga qo‘shish`, callback_data: `ok:${draftId}:${i}` }],
              [{ text: '⏭ Keyingi postni o‘tkazib yuborish', callback_data: `no:${draftId}` }],
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

  // Arxiv — eski xabardagi tugma bosilganda variant shu yerdan topiladi.
  archiveOptions(draftId, options);

  saveDraft({
    draftId,
    createdAt: new Date().toISOString(),
    status: options.length ? 'pending' : 'failed',
    options,
  });

  if (skipped.length) {
    log(`abstrakti topilmagani uchun o'tkazib yuborilgan ${skipped.length} ta maqola:\n  ${skipped.join('\n  ')}`);
  }

  // Kutilganidan kam variant chiqsa — sababini aytamiz. Ilgari bu jimgina
  // o'tib ketardi va "nega faqat A keldi?" degan savol javobsiz qolardi.
  if (options.length && options.length < config.draftCount) {
    await sendMessage(
      token,
      adminChat,
      `ℹ️ Bugun ${config.draftCount} ta emas, <b>${options.length} ta</b> variant chiqdi.\n` +
        `Sabab: ${pool} ta nomzoddan ${skipped.length} tasining abstrakti topilmadi ` +
        `(jurnal feedida xat, izoh va tuzatishlar ko‘p — ularda abstrakt bo‘lmaydi).`,
    ).catch(() => {});
  }

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
