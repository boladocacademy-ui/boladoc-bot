/**
 * Sozlashni tekshirish. Lokal ishga tushiring:
 *   node src/setup-check.js
 * Kerak: TELEGRAM_BOT_TOKEN. Ixtiyoriy: TELEGRAM_CHANNEL_ID, ADMIN_CHAT_ID, GEMINI_API_KEY.
 */
import { getMe, getUpdates } from './telegram.js';
import { fetchWithRetry, loadConfig, log } from './util.js';
import { fetchAllFeeds } from './feeds.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL_ID;
const adminChat = process.env.ADMIN_CHAT_ID;
const geminiKey = process.env.GEMINI_API_KEY;

const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  ℹ️  ${m}`);

async function main() {
  console.log('\n═══ BOLADOC BOT — SOZLAMA TEKSHIRUVI ═══\n');

  console.log('1) Telegram bot');
  if (!token) {
    bad('TELEGRAM_BOT_TOKEN berilmagan');
  } else {
    try {
      const me = await getMe(token);
      ok(`bot: @${me.username} (${me.first_name})`);
    } catch (err) {
      bad(`token ishlamadi: ${err.message}`);
    }
  }

  console.log('\n2) Admin chat ID (siz bilan shaxsiy chat)');
  if (token) {
    try {
      const updates = await getUpdates(token);
      const chats = new Map();
      for (const u of updates) {
        const c = u.message?.chat || u.callback_query?.message?.chat;
        if (c && c.type === 'private') chats.set(c.id, `${c.first_name || ''} @${c.username || '-'}`);
      }
      if (!chats.size) {
        info("Botga Telegramda /start yozing, keyin shu skriptni qayta ishga tushiring");
      } else {
        for (const [id, name] of chats) ok(`ADMIN_CHAT_ID = ${id}  (${name})`);
      }
    } catch (err) {
      bad(`getUpdates xato: ${err.message}`);
    }
  }
  if (adminChat) ok(`hozirgi ADMIN_CHAT_ID = ${adminChat}`);

  console.log('\n3) Kanal huquqlari');
  if (!token || !channel) {
    info('TELEGRAM_CHANNEL_ID berilmagan — tekshirilmadi');
  } else {
    try {
      const me = await getMe(token);
      const res = await fetchWithRetry(
        `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(channel)}&user_id=${me.id}`,
      );
      const data = await res.json();
      const st = data.result?.status;
      if (st === 'administrator' && data.result?.can_post_messages) ok(`bot ${channel} kanalida admin, post qo'ya oladi`);
      else if (st === 'administrator') bad(`bot admin, lekin "Post messages" huquqi yo'q`);
      else bad(`bot kanalda admin emas (status: ${st})`);
    } catch (err) {
      bad(`kanal tekshirilmadi: ${err.message} — bot kanalga admin qilinganini tekshiring`);
    }
  }

  console.log('\n4) Gemini API');
  if (!geminiKey) {
    info('GEMINI_API_KEY berilmagan — tekshirilmadi');
  } else {
    try {
      const res = await fetchWithRetry(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Javob: OK' }] }] }),
        },
        1,
      );
      const data = await res.json();
      ok(`Gemini javob berdi: ${data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'ok'}`);
    } catch (err) {
      bad(`Gemini xato: ${err.message}`);
    }
  }

  console.log('\n5) Manbalar (RSS)');
  const config = loadConfig();
  const items = await fetchAllFeeds(config.feeds);
  const byFeed = new Map();
  for (const it of items) byFeed.set(it.feedId, (byFeed.get(it.feedId) || 0) + 1);
  for (const f of config.feeds) {
    const n = byFeed.get(f.id) || 0;
    if (n > 0) ok(`${f.id}: ${n} ta yozuv`);
    else bad(`${f.id}: yozuv olinmadi`);
  }

  console.log('\n═══ TUGADI ═══\n');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
