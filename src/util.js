import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
}

export function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

/** Ba'zi nashriyot serverlari brauzer bo'lmagan so'rovni 403 qiladi — shuning uchun UA majburiy. */
export async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
      try {
        const res = await fetch(url, {
          ...opts,
          signal: ctrl.signal,
          headers: {
            'User-Agent': UA,
            Accept: opts.accept ?? '*/*',
            ...(opts.headers || {}),
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`fetch failed: ${url} — ${lastErr?.message}`);
}

export function stripHtml(s = '') {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Telegram parse_mode=HTML faqat shu teglarni biladi; qolgan < & > qochirilishi shart. */
export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Har xil apostrof ko'rinishlari: ' ’ ‘ ` ´ ʹ ʻ ʼ */
const APOS_CLASS = "['’‘`´ʹʻʼ]";

/**
 * O'zbek lotin yozuvidagi apostroflarni bir xillashtiradi.
 * Model bir postda ham "o'" ham "oʻ" yozib yuboradi — bu tahrir qilinmagandek ko'rinadi.
 *   oʻ / gʻ  → U+02BB (okina, harfning bir qismi)
 *   sunʼiy   → U+02BC (tutuq belgisi)
 */
export function fixUzbekApostrophes(s = '') {
  const OKINA = 'ʻ';
  const TUTUQ = 'ʼ';
  const MARK = '@@OKINA@@'; // vaqtinchalik belgi; oddiy matnda uchramaydi
  // Ikki bosqichni ajratish shart: bitta o'tishda 2-qadam 1-qadam qo'ygan
  // okinani ham tutuqqa aylantirib yuborardi.
  return String(s)
    .replace(new RegExp(`([ogOG])${APOS_CLASS}`, 'g'), `$1${MARK}`)
    .replace(new RegExp(APOS_CLASS, 'g'), TUTUQ)
    .replace(new RegExp(MARK, 'g'), OKINA);
}

/**
 * Hashtagni tozalaydi. Model ba'zan boshqa alifbo qo'shib yuboradi
 * (kuzatilgan holat: "#endokrinologiya批判") — bunday hashtag kanalga chiqmasligi kerak.
 * Faqat ASCII harf, raqam va pastki chiziq qoldiriladi.
 */
export function cleanHashtag(raw = '') {
  const body = String(raw)
    .trim()
    .replace(/^#+/, '')
    .replace(new RegExp(APOS_CLASS, 'g'), '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  if (body.length < 3 || body.length > 30) return '';
  // Model ba'zan ichki axlat chiqaradi, masalan:
  // "#pediatriya_me0000000e00_lower_bounds_range_0_0" — raqam uyumi shuning belgisi.
  if (/\d{3,}/.test(body)) return '';
  if (!/[A-Za-z]{3}/.test(body)) return '';
  return `#${body}`;
}

export function truncate(s = '', max = 200) {
  const t = String(s).trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** RSS linklarida bo'sh joy uchraydi (AAP), Telegram uni link deb qabul qilmaydi. */
export function normalizeUrl(u = '') {
  return String(u).trim().replace(/\s/g, '%20');
}

export function dedupeKey(item) {
  const raw = (item.guid || item.link || item.title || '').toLowerCase();
  return raw.replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '').trim();
}

export function todayId(tz = 'Asia/Tashkent') {
  // sv-SE lokali YYYY-MM-DD formatini beradi — sana bo'yicha barqaror ID uchun qulay.
  return new Date().toLocaleDateString('sv-SE', { timeZone: tz });
}

export function formatDateUz(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
  ];
  return `${d.getUTCDate()}-${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
