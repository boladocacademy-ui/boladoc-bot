import { escapeHtml, formatDateUz, truncate } from './util.js';

export const CAPTION_LIMIT = 1024;

function assemble(content, item, brand, { bullets, hook, takeaway }) {
  const dateText = formatDateUz(item.pubDate);
  const parts = [];

  parts.push(`🩺 <b>${escapeHtml(content.title_uz)}</b>`);
  if (hook) parts.push(escapeHtml(hook));
  if (bullets.length) parts.push(bullets.map((b) => escapeHtml(b)).join('\n'));
  if (takeaway) parts.push(`💡 <b>Amaliyotga:</b> ${escapeHtml(takeaway)}`);

  const sourceLine = `📚 <b>Manba:</b> ${escapeHtml(item.sourceFull)}${dateText ? ` · ${escapeHtml(dateText)}` : ''}`;
  parts.push(`${sourceLine}\n🔗 <a href="${escapeHtml(item.link)}">Original maqolani o‘qish</a>`);

  const tags = content.hashtags.join(' ');
  parts.push(`${escapeHtml(tags)}\n${escapeHtml(brand.handle)}`);

  return parts.join('\n\n');
}

/**
 * Telegram rasm captionida 1024 belgi chegarasi bor (emoji 2 ta hisoblanadi).
 * Manba va link HECH QACHON qisqartirilmaydi — ular postning asosi.
 * Shuning uchun avval 3-punkt, keyin hook, keyin takeaway qisqaradi.
 */
export function buildCaption(content, item, brand) {
  let bullets = [...content.bullets];
  let hook = content.hook;
  let takeaway = content.takeaway;

  const steps = [
    () => { if (bullets.length > 2) { bullets = bullets.slice(0, 2); return true; } return false; },
    () => { if (hook.length > 90) { hook = truncate(hook, 90); return true; } return false; },
    () => { if (takeaway.length > 120) { takeaway = truncate(takeaway, 120); return true; } return false; },
    () => { if (bullets.length > 1) { bullets = bullets.slice(0, 1); return true; } return false; },
    () => { if (hook) { hook = ''; return true; } return false; },
    () => {
      const before = bullets.length;
      bullets = bullets.map((b) => truncate(b, 90));
      return before > 0;
    },
  ];

  let caption = assemble(content, item, brand, { bullets, hook, takeaway });
  for (const step of steps) {
    if (caption.length <= CAPTION_LIMIT) break;
    if (!step()) continue;
    caption = assemble(content, item, brand, { bullets, hook, takeaway });
  }

  if (caption.length > CAPTION_LIMIT) {
    // Kutilmagan holat — hech bo'lmasa yuborilsin, link saqlanib qolsin.
    caption = assemble(content, item, brand, { bullets: [], hook: '', takeaway: '' });
  }
  return caption;
}
