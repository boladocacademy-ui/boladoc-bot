/**
 * Telegramdagi javoblarni o'qib, tasdiqlangan variantlarni navbatga qo'yadi.
 *
 * Muhim: tugma qaysi kunning xabarida bosilganidan qat'i nazar ishlaydi.
 * callback_data ichidagi draftId + index bo'yicha variant arxivdan topiladi,
 * shuning uchun kechagi (yoki o'tgan haftagi) A variantni ham tasdiqlash mumkin.
 * Bir kunda bir nechtasini tasdiqlasangiz — hammasi navbatga tushadi va
 * har kuni bittadan chiqadi.
 *
 * Bu funksiya ham draft (21:00), ham publish (08:00) da chaqiriladi. Draftda
 * chaqirilishi shart: u eski yangilanishlarni navbatdan tozalaydi, tozalashdan
 * oldin esa tasdiqlar yig'ib olinishi kerak — aks holda bosilgan tugma yo'qoladi.
 */
import { getUpdates, confirmUpdates, answerCallback } from './telegram.js';
import { loadQueue, saveQueue, loadPosted, findOption } from './state.js';
import { log } from './util.js';

const TEXT_TO_INDEX = {
  a: 0, 1: 0, ha: 0, ok: 0, okay: 0, mayli: 0, '+': 0,
  b: 1, 2: 1,
  c: 2, 3: 2,
};
const TEXT_NO = ["yo'q", 'yoq', 'no', 'bekor', '-'];

/** Bitta yangilanishni qarorga aylantiradi. Toza funksiya — testda ishlatiladi. */
export function parseUpdate(u, adminChatId, latestDraftId) {
  const cq = u.callback_query;
  if (cq?.data) {
    const [action, draftId, index] = cq.data.split(':');
    if (action === 'ok') return { type: 'ok', draftId, index: Number(index), callbackId: cq.id };
    if (action === 'no') return { type: 'no', callbackId: cq.id };
    return null;
  }

  const msg = u.message;
  if (msg?.text && String(msg.chat?.id) === String(adminChatId)) {
    const t = msg.text.trim().toLowerCase().replace(/[‘’']/g, "'");
    // Matnli javob eng oxirgi draftga tegishli deb qaraladi — eski variantni
    // tanlash uchun tugma bor.
    if (t in TEXT_TO_INDEX && latestDraftId) {
      return { type: 'ok', draftId: latestDraftId, index: TEXT_TO_INDEX[t] };
    }
    if (TEXT_NO.includes(t)) return { type: 'no' };
  }
  return null;
}

/**
 * Navbatga qo'shish. Bir maqola ikki marta chiqmasligi kerak — shuning uchun
 * allaqachon chiqarilgan yoki navbatda turgani qaytarilmaydi.
 */
export function enqueue(queue, option, postedSet) {
  if (!option) {
    return { ok: false, text: 'Bu variant topilmadi — juda eski xabar.' };
  }
  if (postedSet.has(option.key)) {
    return { ok: false, text: 'Bu maqola allaqachon kanalga chiqqan.' };
  }
  if (queue.items.some((i) => i.key === option.key)) {
    const place = queue.items.findIndex((i) => i.key === option.key) + 1;
    return { ok: false, text: `Bu variant allaqachon navbatda (${place}-o'rin).` };
  }
  queue.items.push({ ...option, approvedAt: new Date().toISOString() });
  return {
    ok: true,
    text: `✅ Navbatga qo'shildi — ${queue.items.length}-o'rin.`,
    option,
  };
}

/**
 * Navbatdagi barcha javoblarni o'qiydi, navbatni yangilaydi va o'qilganini
 * Telegram navbatidan tozalaydi.
 */
export async function harvestApprovals(token, adminChatId, latestDraft) {
  let updates = [];
  try {
    updates = await getUpdates(token);
  } catch (err) {
    log(`javoblarni o'qib bo'lmadi: ${err.message}`);
    return { added: [], rejected: [], skipRequested: false };
  }
  if (!updates.length) return { added: [], rejected: [], skipRequested: false };

  const queue = loadQueue();
  const { set: posted } = loadPosted();
  const added = [];
  const rejected = [];
  let skipRequested = false;
  let lastUpdateId;

  for (const u of updates) {
    lastUpdateId = u.update_id;
    const d = parseUpdate(u, adminChatId, latestDraft?.draftId);
    if (!d) continue;

    if (d.type === 'no') {
      skipRequested = true;
      queue.skipNext = true;
      if (d.callbackId) {
        await answerCallback(token, d.callbackId, 'Keyingi post o‘tkazib yuboriladi.');
      }
      continue;
    }

    const option = findOption(d.draftId, d.index);
    const res = enqueue(queue, option, posted);
    if (res.ok) added.push(res.option);
    else rejected.push(res.text);
    if (d.callbackId) await answerCallback(token, d.callbackId, res.text, !res.ok);
  }

  saveQueue(queue);
  await confirmUpdates(token, lastUpdateId);

  if (added.length) {
    log(`navbatga ${added.length} ta variant qo'shildi (jami ${queue.items.length})`);
  }
  for (const r of rejected) log(`tasdiq qabul qilinmadi: ${r}`);

  return { added, rejected, skipRequested, queueLength: queue.items.length };
}
