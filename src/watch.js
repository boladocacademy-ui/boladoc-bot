/**
 * Uzluksiz kuzatuvchi — tugma bosilishini soniyalar ichida ushlaydi.
 *
 * NEGA KERAK. Ilgari tasdiqlarni har 15 daqiqada ishga tushadigan cron
 * tekshirardi. GitHub esa qisqa oraliqli cronlarni deyarli bajarmaydi:
 * 13-14 avgustda 21 soat davomida ~84 ta o'rniga atigi 5 ta ish ishga
 * tushdi (94% tashlab yuborilgan). Shuning uchun tugma bosilganda hech
 * qanday javob kelmasdi.
 *
 * Yechim: cronga tayanmaymiz. Bitta ish uzoq turadi va Telegramni "long
 * polling" bilan tinglaydi — bosilgan tugma darhol ishlanadi. Ish tugagach
 * soatlik cron yangisini boshlaydi.
 *
 * Public repoda GitHub Actions daqiqalari cheksiz, shuning uchun bu bepul.
 */
import { execFileSync } from 'node:child_process';
import { log, sleep } from './util.js';
import { loadDraft, loadQueue } from './state.js';
import { harvestApprovals } from './approvals.js';
import { sendMessage } from './telegram.js';

const MINUTES = Number(process.env.WATCH_MINUTES || 55);
const DEADLINE = Date.now() + MINUTES * 60 * 1000;
const PUSH = process.env.WATCH_PUSH === '1';

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} muhit o'zgaruvchisi yo'q`);
  return v;
}

/** Tasdiq yo'qolmasligi uchun har o'zgarishdan keyin darhol saqlanadi. */
function persist(message) {
  if (!PUSH) return;
  try {
    execFileSync('git', ['add', 'state'], { stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', message], { stdio: 'ignore' });
  } catch {
    return; // o'zgarish yo'q
  }
  try {
    execFileSync('git', ['pull', '--rebase', '--autostash'], { stdio: 'ignore' });
    execFileSync('git', ['push'], { stdio: 'ignore' });
    log('holat saqlandi');
  } catch (err) {
    log(`push bo'lmadi: ${err.message}`);
  }
}

async function main() {
  const token = env('TELEGRAM_BOT_TOKEN');
  const admin = env('ADMIN_CHAT_ID');
  log(`kuzatuv boshlandi — ${MINUTES} daqiqa`);

  let idle = 0;

  while (Date.now() < DEADLINE) {
    let data;
    try {
      // Long polling: Telegram tugma bosilgunicha ulanishni ushlab turadi,
      // shuning uchun bu sikl protsessorni yemaydi.
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&limit=1`,
        { signal: AbortSignal.timeout(40_000) },
      );
      data = await res.json();
    } catch {
      await sleep(5000);
      continue;
    }

    // 409 = boshqa ish (draft yoki publish) ayni damda Telegramni o'qiyapti.
    // Unga yo'l beramiz, keyin davom etamiz.
    if (!data.ok) {
      if (data.error_code === 409) {
        log('boshqa ish Telegramni o‘qiyapti — 60 soniya kutamiz');
        await sleep(60_000);
      } else {
        log(`getUpdates xato: ${data.description}`);
        await sleep(10_000);
      }
      continue;
    }

    if (!data.result.length) {
      if (++idle % 20 === 0) log(`tinch — ${Math.round((DEADLINE - Date.now()) / 60000)} daqiqa qoldi`);
      continue;
    }
    idle = 0;

    const res = await harvestApprovals(token, admin, loadDraft());
    if (!res.added.length && !res.rejected.length && !res.skipRequested) continue;

    const queue = loadQueue();
    const lines = [];
    if (res.added.length) {
      lines.push('✅ <b>Navbatga qo‘shildi:</b>');
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

    await sendMessage(token, admin, lines.join('\n')).catch(() => {});
    persist(`navbat: ${new Date().toISOString().slice(0, 16)}`);
  }

  log('kuzatuv vaqti tugadi — keyingi ish davom ettiradi');
  persist(`navbat: yakun ${new Date().toISOString().slice(0, 16)}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
