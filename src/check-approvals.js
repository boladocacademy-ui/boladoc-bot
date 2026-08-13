/**
 * Har 15 daqiqada — bosilgan tugmalarni o'qib navbatga qo'shadi.
 *
 * Buning yagona maqsadi — javobni tez qaytarish. Tasdiqni draft (21:00) va
 * publish (08:00) ham o'qiydi, lekin o'shanda tugma bosilganiga bir necha
 * soat bo'lgan bo'lardi: Telegram callback'ga javob berish muddati o'tib
 * ketadi va ekranda hech narsa chiqmaydi. Odam esa "bosdim-ku, nima bo'ldi?"
 * deb qoladi.
 */
import { log } from './util.js';
import { loadDraft, loadQueue } from './state.js';
import { harvestApprovals } from './approvals.js';
import { sendMessage } from './telegram.js';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

async function main() {
  const token = env('TELEGRAM_BOT_TOKEN');
  const adminChat = env('ADMIN_CHAT_ID');

  const res = await harvestApprovals(token, adminChat, loadDraft());

  if (!res.added.length && !res.rejected.length && !res.skipRequested) {
    log('yangi tasdiq yo‘q');
    return;
  }

  const queue = loadQueue();
  const lines = [];

  if (res.added.length) {
    lines.push(`✅ <b>Navbatga qo‘shildi:</b>`);
    for (const o of res.added) lines.push(`• ${o.titleUz || o.title}`);
  }
  for (const r of res.rejected) lines.push(`⚠️ ${r}`);
  if (res.skipRequested) lines.push('⏭ Keyingi post o‘tkazib yuboriladi.');

  lines.push('');
  lines.push(
    queue.items.length
      ? `📥 Navbatda <b>${queue.items.length}</b> ta post — har kuni 08:00 da bittasi chiqadi.`
      : '📭 Navbat bo‘sh.',
  );

  await sendMessage(token, adminChat, lines.join('\n')).catch(() => {});
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
