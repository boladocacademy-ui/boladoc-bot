import { fetchWithRetry, log } from './util.js';

const API = 'https://api.telegram.org/bot';

async function call(token, method, payload) {
  const res = await fetchWithRetry(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

export async function sendMessage(token, chatId, text, extra = {}) {
  return call(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

export async function sendPhoto(token, chatId, pngBuffer, caption, extra = {}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'post.png');
  for (const [k, v] of Object.entries(extra)) {
    form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }

  const res = await fetchWithRetry(`${API}${token}/sendPhoto`, {
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendPhoto: ${data.description}`);
  return data.result;
}

/**
 * 21:00 da adminga yuborilgan rasm file_id bilan qayta ishlatiladi —
 * shunda kanalga aynan siz tasdiqlagan rasm tushadi, qayta generatsiya bo'lmaydi.
 */
export async function sendPhotoByFileId(token, chatId, fileId, caption) {
  return call(token, 'sendPhoto', {
    chat_id: chatId,
    photo: fileId,
    caption,
    parse_mode: 'HTML',
  });
}

export async function getUpdates(token, offset) {
  const payload = { timeout: 0, limit: 100, allowed_updates: ['callback_query', 'message'] };
  if (offset !== undefined) payload.offset = offset;
  return call(token, 'getUpdates', payload);
}

/** Tasdiqlangan yangilanishlarni navbatdan tozalaydi (aks holda 24 soat qaytaraveradi). */
export async function confirmUpdates(token, lastUpdateId) {
  if (lastUpdateId === undefined) return;
  try {
    await getUpdates(token, lastUpdateId + 1);
  } catch (err) {
    log(`offset tozalanmadi: ${err.message}`);
  }
}

export async function answerCallback(token, callbackQueryId, text, showAlert = false) {
  try {
    await call(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch {
    // Tugma bosilganiga 24 soat bo'lganda Telegram xato beradi — bu kutilgan holat.
  }
}

/**
 * Eski draftdagi tugmalarni o'chiradi. Aks holda admin kechagi xabardagi
 * tugmani bosadi, callback_data ichidagi draftId esa boshqa bo'ladi —
 * tasdiq jimgina e'tiborsiz qoladi.
 */
export async function clearKeyboard(token, chatId, messageId) {
  try {
    await call(token, 'editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
    return true;
  } catch {
    // Xabar o'chirilgan yoki 48 soatdan oshgan bo'lishi mumkin — muhim emas.
    return false;
  }
}

export async function getMe(token) {
  return call(token, 'getMe', {});
}
