import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.js';

const STATE_DIR = path.join(ROOT, 'state');
const POSTED_FILE = path.join(STATE_DIR, 'posted.json');
const DRAFT_FILE = path.join(STATE_DIR, 'draft.json');
const QUEUE_FILE = path.join(STATE_DIR, 'queue.json');
const OPTIONS_FILE = path.join(STATE_DIR, 'options.json');

const MAX_POSTED = 600;
// Eski xabardagi tugma ham ishlashi kerak — shuning uchun yuborilgan
// variantlar arxivda saqlanadi (taxminan 1 oylik draft).
const MAX_ARCHIVE = 60;

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function loadPosted() {
  const data = readJson(POSTED_FILE, { keys: [], entries: [] });
  return {
    set: new Set(data.keys || []),
    entries: data.entries || [],
  };
}

export function addPosted(key, meta) {
  ensureDir();
  const data = readJson(POSTED_FILE, { keys: [], entries: [] });
  data.keys = [key, ...(data.keys || []).filter((k) => k !== key)].slice(0, MAX_POSTED);
  data.entries = [
    { key, ...meta },
    ...(data.entries || []).filter((e) => e.key !== key),
  ].slice(0, 120);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function saveDraft(draft) {
  ensureDir();
  fs.writeFileSync(DRAFT_FILE, JSON.stringify(draft, null, 2), 'utf8');
}

export function loadDraft() {
  return readJson(DRAFT_FILE, null);
}

/* ── Navbat ────────────────────────────────────────────────────────────────
 * Tasdiqlangan variant darhol chiqmaydi, navbatga tushadi. Har kuni 08:00 da
 * navbatning boshidagi bitta post chiqariladi. Shuning uchun bir kunda A ni
 * ham, B ni ham (hatto kechagi variantni ham) tasdiqlash mumkin.
 */
export function loadQueue() {
  const q = readJson(QUEUE_FILE, {});
  return {
    items: q.items || [],
    skipNext: Boolean(q.skipNext),
    // Bugungi chiqarish hal qilinganini bildiradi (chiqdi / o'tkazildi / navbat bo'sh).
    handledOn: q.handledOn || null,
  };
}

export function saveQueue(queue) {
  ensureDir();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

/** Navbatdagi maqolalar qayta tanlanmasligi uchun. */
export function queuedKeys() {
  return new Set(loadQueue().items.map((i) => i.key));
}

/* ── Yuborilgan variantlar arxivi ────────────────────────────────────────── */
export function archiveOptions(draftId, options) {
  if (!options?.length) return;
  ensureDir();
  const data = readJson(OPTIONS_FILE, { options: [] });
  const fresh = options.map((o) => ({ ...o, draftId }));
  const rest = (data.options || []).filter(
    (o) => !fresh.some((f) => f.draftId === o.draftId && f.index === o.index),
  );
  data.options = [...fresh, ...rest].slice(0, MAX_ARCHIVE);
  fs.writeFileSync(OPTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Arxivda turgan (ya'ni oldin taklif qilingan) maqolalar kalitlari.
 * Tasdiqlanmagan maqola ertasi kuni ham nomzod bo'lib qoladi — shuning uchun
 * ularni ro'yxat oxiriga suramiz, aks holda har kuni bir xil variant chiqadi.
 */
export function offeredKeys() {
  const data = readJson(OPTIONS_FILE, { options: [] });
  return new Set((data.options || []).map((o) => o.key));
}

/** Tugma bosilganda callback_data (draftId + index) shu arxivdan qidiriladi. */
export function findOption(draftId, index) {
  const data = readJson(OPTIONS_FILE, { options: [] });
  return (
    (data.options || []).find(
      (o) => o.draftId === draftId && Number(o.index) === Number(index),
    ) || null
  );
}

