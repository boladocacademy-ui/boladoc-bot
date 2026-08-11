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

  return `${parts.join('\n\n')}${buildFooter(brand)}`;
}

/**
 * Tugash bloki har postda bir xil: bo'sh abzats, keyin telefon, kanal va
 * Instagram — har biri alohida abzatsda.
 */
export function buildFooter(brand) {
  const lines = [''];
  if (brand.phone) lines.push(`📞 ${escapeHtml(brand.phone)}`);
  if (brand.handle) lines.push(`😎 ${escapeHtml(brand.handle)}`);
  if (brand.instagram) lines.push(`😎 <a href="${escapeHtml(brand.instagram)}">Instagram</a>`);
  return lines.length > 1 ? `\n\n${lines.join('\n\n')}` : '';
}

/**
 * Telegram 1024 chegarasini HTML teglarisiz, KO'RINADIGAN matn bo'yicha sanaydi:
 * <b> va <a href="..."> markup limitga kirmaydi, faqat havolaning ko'rinadigan
 * yozuvi kiradi. Xom `caption.length` bilan sanash uzun havolali AAP postlarida
 * punktni keraksiz o'chirib yuborardi.
 */
export function visibleLength(html) {
  return html
    .replace(/<a\s+href="[^"]*">/gi, '')
    .replace(/<\/?(?:a|b|i|u|s|code|pre)>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').length;
}

// Telegram hisobi bilan bizniki chetda farq qilib qolsa, post yo'qolmasin.
const SAFETY_MARGIN = 16;

/**
 * Manba va link HECH QACHON qisqartirilmaydi — ular postning asosi.
 * Qisqartirish tartibi: avval eng kam ma'lumot yo'qotadigan qadam.
 * Butun punktni o'chirish — oxirgi chora, chunki u eng ko'p ma'lumot yo'qotadi.
 */
export function buildCaption(content, item, brand) {
  let bullets = [...content.bullets];
  let hook = content.hook;
  let takeaway = content.takeaway;

  const steps = [
    () => { if (hook.length > 110) { hook = truncate(hook, 110); return true; } return false; },
    () => { if (takeaway.length > 140) { takeaway = truncate(takeaway, 140); return true; } return false; },
    () => {
      if (bullets.some((b) => b.length > 105)) {
        bullets = bullets.map((b) => truncate(b, 105));
        return true;
      }
      return false;
    },
    () => { if (hook.length > 70) { hook = truncate(hook, 70); return true; } return false; },
    () => { if (bullets.length > 2) { bullets = bullets.slice(0, 2); return true; } return false; },
    () => { if (hook) { hook = ''; return true; } return false; },
    () => { if (bullets.length > 1) { bullets = bullets.slice(0, 1); return true; } return false; },
  ];

  const limit = CAPTION_LIMIT - SAFETY_MARGIN;
  let caption = assemble(content, item, brand, { bullets, hook, takeaway });
  for (const step of steps) {
    if (visibleLength(caption) <= limit) break;
    if (!step()) continue;
    caption = assemble(content, item, brand, { bullets, hook, takeaway });
  }

  if (visibleLength(caption) > limit) {
    // Kutilmagan holat — hech bo'lmasa yuborilsin, link saqlanib qolsin.
    caption = assemble(content, item, brand, { bullets: [], hook: '', takeaway: '' });
  }
  return caption;
}
