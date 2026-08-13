/**
 * 08:00 (Toshkent) — navbatdagi bitta postni kanalga chiqaradi.
 * Navbat bo'sh bo'lsa hech narsa chop etilmaydi.
 */
import { pathToFileURL } from 'node:url';
import { loadConfig, log, sleep, truncate, todayId } from './util.js';
import { sendPhotoByFileId, sendMessage } from './telegram.js';
import { loadDraft, loadQueue, saveQueue, addPosted, loadPosted } from './state.js';
import { harvestApprovals } from './approvals.js';

const MAX_WAIT_MS = 70 * 60 * 1000;

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

/** GitHub Actions croni kechikadi — aniq belgilangan daqiqagacha kutamiz. */
async function waitUntilUtc(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0),
  );
  let delta = target.getTime() - Date.now();

  if (delta <= 0) {
    log(`belgilangan vaqt (${hhmm} UTC) allaqachon o'tgan — darhol davom etamiz`);
    return;
  }
  if (delta > MAX_WAIT_MS) {
    log(`kutish vaqti juda uzun (${Math.round(delta / 60000)} daq) — kutmasdan davom etamiz`);
    return;
  }
  log(`${Math.round(delta / 1000)} soniya kutilmoqda → ${hhmm} UTC`);
  while (delta > 0) {
    await sleep(Math.min(delta, 30_000));
    delta = target.getTime() - Date.now();
  }
}

async function main() {
  const config = loadConfig();
  const token = env('TELEGRAM_BOT_TOKEN');
  const adminChat = env('ADMIN_CHAT_ID');
  const channel = env('TELEGRAM_CHANNEL_ID');
  const today = todayId();

  // Jadval kechikishiga qarshi publish kuniga ikki marta rejalashtirilgan.
  // Birinchisi ishlagan bo'lsa, ikkinchisi hech narsa qilmaydi — aks holda
  // navbatdan bir kunda ikkita post ketib qolardi.
  if (loadQueue().handledOn === today) {
    log(`bugungi chiqarish (${today}) allaqachon hal qilingan — takrorlanmaydi`);
    return;
  }

  await waitUntilUtc(config.publishAtUtc || '03:00');

  // Oxirgi daqiqada bosilgan tugmalar ham hisobga olinsin.
  await harvestApprovals(token, adminChat, loadDraft());

  const queue = loadQueue();

  if (queue.skipNext) {
    log('admin "post chiqmasin" degan — bugun o‘tkazib yuboriladi');
    queue.skipNext = false;
    queue.handledOn = today;
    saveQueue(queue);
    await sendMessage(
      token,
      adminChat,
      `🚫 <b>Bugun post chiqmadi</b> — siz o‘tkazib yuborishni so‘ragan edingiz.\n` +
        `Navbatda ${queue.items.length} ta post turibdi.`,
    ).catch(() => {});
    return;
  }

  const { set: posted } = loadPosted();
  // Navbat boshidagi, hali chiqarilmagan birinchi postni olamiz.
  const idx = queue.items.findIndex((i) => !posted.has(i.key));
  const option = idx === -1 ? null : queue.items[idx];

  if (!option) {
    log('navbat bo‘sh — post chiqmaydi');
    queue.handledOn = today;
    saveQueue(queue);
    await sendMessage(
      token,
      adminChat,
      '⏸ <b>Bugun post chiqmadi.</b>\nSabab: navbat bo‘sh — hech qaysi variant tasdiqlanmagan.',
    ).catch(() => {});
    return;
  }

  log(`chop etilmoqda: ${option.draftId} / ${option.label} — ${option.title}`);

  try {
    const sent = await sendPhotoByFileId(token, channel, option.fileId, option.caption);
    addPosted(option.key, {
      postedAt: new Date().toISOString(),
      title: option.title,
      titleUz: option.titleUz,
      link: option.link,
      source: option.source,
      messageId: sent.message_id,
    });

    const fresh = loadQueue();
    fresh.items = fresh.items.filter((i) => i.key !== option.key);
    fresh.handledOn = today;
    saveQueue(fresh);
    log(`kanalga chiqarildi — navbatda yana ${fresh.items.length} ta post`);

    await sendMessage(
      token,
      adminChat,
      `✅ <b>Post kanalga chiqdi</b>\n${option.source} · ${option.titleUz}\n\n` +
        (fresh.items.length
          ? `📥 Navbatda yana <b>${fresh.items.length}</b> ta post bor — ertaga keyingisi chiqadi.`
          : `📭 Navbat bo‘shadi.`),
    ).catch(() => {});
  } catch (err) {
    await sendMessage(
      token,
      adminChat,
      `❌ <b>Post chiqmadi — xato</b>\n${truncate(err.message, 300)}`,
    ).catch(() => {});
    throw err;
  }
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda bajariladi (test uchun import qilinsa — yo'q).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
