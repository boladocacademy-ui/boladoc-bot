/**
 * 08:00 (Toshkent) — kechagi draftni tekshiradi va TASDIQLANGAN bo'lsagina kanalga chiqaradi.
 * Tasdiq bo'lmasa hech narsa chop etilmaydi.
 */
import { pathToFileURL } from 'node:url';
import { loadConfig, log, sleep, truncate } from './util.js';
import { getUpdates, confirmUpdates, answerCallback, sendPhotoByFileId, sendMessage } from './telegram.js';
import { loadDraft, markDraftHandled, addPosted } from './state.js';

const MAX_WAIT_MS = 35 * 60 * 1000;

function env(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

/** GitHub Actions croni bir necha daqiqa kechikadi — aniq 08:00 uchun kutamiz. */
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

/**
 * Tugma bosilishi ham, oddiy javob matni ham qabul qilinadi:
 *   "A"/"1"/"ha"/"ok"  → 1-variant,  "B"/"2" → 2-variant,  "yo'q"/"no" → bekor.
 */
export function readDecision(updates, draft, adminChatId) {
  let decision = null;
  let lastUpdateId;

  for (const u of updates) {
    lastUpdateId = u.update_id;

    const cq = u.callback_query;
    if (cq?.data) {
      const [action, id, idx] = cq.data.split(':');
      if (id !== draft.draftId) continue;
      if (action === 'ok') decision = { type: 'ok', index: Number(idx), callbackId: cq.id };
      if (action === 'no') decision = { type: 'no', callbackId: cq.id };
      continue;
    }

    const msg = u.message;
    if (msg?.text && String(msg.chat?.id) === String(adminChatId)) {
      if (new Date(msg.date * 1000) < new Date(draft.createdAt)) continue;
      const t = msg.text.trim().toLowerCase().replace(/[‘’']/g, "'");
      if (['a', '1', 'ha', 'ok', 'okay', 'mayli', '+'].includes(t)) decision = { type: 'ok', index: 0 };
      else if (['b', '2'].includes(t)) decision = { type: 'ok', index: 1 };
      else if (['c', '3'].includes(t)) decision = { type: 'ok', index: 2 };
      else if (["yo'q", 'yoq', 'no', 'bekor', '-'].includes(t)) decision = { type: 'no' };
    }
  }

  return { decision, lastUpdateId };
}

async function main() {
  const config = loadConfig();
  const token = env('TELEGRAM_BOT_TOKEN');
  const adminChat = env('ADMIN_CHAT_ID');
  const channel = env('TELEGRAM_CHANNEL_ID');

  const draft = loadDraft();
  if (!draft || !draft.options?.length) {
    log('draft yo\'q — chiqariladigan post yo\'q');
    return;
  }
  if (draft.status && draft.status !== 'pending') {
    log(`draft holati "${draft.status}" — qayta chop etilmaydi`);
    return;
  }

  await waitUntilUtc(config.publishAtUtc || '03:00');

  const updates = await getUpdates(token);
  const { decision, lastUpdateId } = readDecision(updates, draft, adminChat);

  if (!decision) {
    log('tasdiq topilmadi — post chiqmaydi');
    await sendMessage(
      token,
      adminChat,
      '⏸ <b>Bugun post chiqmadi.</b>\nSabab: variantlardan biri tasdiqlanmadi.',
    ).catch(() => {});
    markDraftHandled('no-approval');
    await confirmUpdates(token, lastUpdateId);
    return;
  }

  if (decision.callbackId) {
    await answerCallback(token, decision.callbackId, decision.type === 'ok' ? 'Qabul qilindi' : 'Bekor qilindi');
  }

  if (decision.type === 'no') {
    log('admin bekor qildi');
    await sendMessage(token, adminChat, '🚫 <b>Bekor qilindi.</b> Bugun kanalga post chiqmadi.').catch(() => {});
    markDraftHandled('cancelled');
    await confirmUpdates(token, lastUpdateId);
    return;
  }

  const option = draft.options.find((o) => o.index === decision.index) || draft.options[0];
  log(`chop etilmoqda: variant ${option.label} — ${option.title}`);

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
    markDraftHandled('published');
    log('kanalga chiqarildi');

    await sendMessage(
      token,
      adminChat,
      `✅ <b>Post kanalga chiqdi</b>\nVariant ${option.label} · ${option.source}\n${option.titleUz}`,
    ).catch(() => {});
  } catch (err) {
    await sendMessage(
      token,
      adminChat,
      `❌ <b>Post chiqmadi — xato</b>\n${truncate(err.message, 300)}`,
    ).catch(() => {});
    throw err;
  }

  await confirmUpdates(token, lastUpdateId);
}

// Faqat to'g'ridan-to'g'ri ishga tushirilganda bajariladi (test uchun import qilinsa — yo'q).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
