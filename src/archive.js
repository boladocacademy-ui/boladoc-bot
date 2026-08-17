/**
 * ARXIV MANBASI — Europe PMC qidiruvi.
 *
 * Nima uchun kerak. RSS feedlari faqat oxirgi bir-ikki sonni beradi: AAP 7 ta,
 * JAMA 56 ta yozuv, tamom. Shuning uchun `maxAgeDays` ni oshirish hech narsa
 * o'zgartirmaydi — chegara emas, feedning o'zi cheklaydi. 17-avgustda
 * o'lchandi: 45 kun ham, 365 kun ham 41 ta nomzod berdi.
 *
 * Europe PMC esa bir yillik arxivni beradi (o'lchandi: 2330 ta maqola) va
 * uchta muhim ustunligi bor:
 *   1. `HAS_ABSTRACT:Y` — abstrakti yo'q maqola qidiruvga tushmaydi. Aynan
 *      shu narsa "kuniga bitta variant" muammosini keltirgan edi.
 *   2. Abstrakt javobning ichida keladi — alohida so'rov kerak emas.
 *   3. Bepul, kalit talab qilmaydi.
 */
import { fetchWithRetry, log } from './util.js';
import { tidyStructuredAbstract } from './feeds.js';

const SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/** Maqola emas — abstrakt filtri ularning ko'pini allaqachon tutadi, qolgani shu. */
const EXCLUDED_TYPES = ['Editorial', 'Comment', 'Letter', 'Published Erratum', 'News'];

const PAGE_SIZE = 100;

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/** Tarmoqsiz sinash uchun ochilgan (selftest.js 7-bo'lim). */
export function buildQuery(journals, months) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - months);

  const jq = journals.map((j) => `JOURNAL:"${j.name.replace(/"/g, '')}"`).join(' OR ');
  const excl = EXCLUDED_TYPES.map((t) => `PUB_TYPE:"${t}"`).join(' OR ');

  return (
    `(${jq}) AND (FIRST_PDATE:[${ymd(from)} TO ${ymd(to)}])` +
    ` AND HAS_ABSTRACT:Y AND SRC:MED AND NOT (${excl})`
  );
}

/**
 * Europe PMC sarlavhani nuqta bilan tugatadi va ba'zan HTML entity qoldiradi
 * ("infants &lt; 29 weeks"). Postga chiqadigan matn shu sarlavhadan boshlanadi.
 */
function cleanTitle(t) {
  return String(t || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();
}

/** Tarmoqsiz sinash uchun ochilgan (selftest.js 7-bo'lim). */
export function toItem(hit, journalMap) {
  const title = cleanTitle(hit.title);
  const abstract = tidyStructuredAbstract(hit.abstractText || '').slice(0, 4000);
  if (!title || !abstract) return null;

  const journalTitle = hit.journalInfo?.journal?.title || '';
  const cfg = journalMap.get(journalTitle.toLowerCase()) || {};

  const link = hit.doi
    ? `https://doi.org/${hit.doi}`
    : hit.pmid
      ? `https://europepmc.org/article/MED/${hit.pmid}`
      : null;
  if (!link) return null;

  const published = hit.firstPublicationDate ? new Date(hit.firstPublicationDate) : null;

  return {
    title,
    // Taqiqlangan mavzu filtri sarlavha + tavsifni ko'radi. To'liq abstraktni
    // bersak, "maternal smoking" kabi yo'l-yo'lakay eslatilgan omil butun
    // maqolani tashlab yuboradi — shuning uchun faqat boshi (Maqsad/Fon).
    description: abstract.slice(0, 300),
    link,
    // caption.js va image.js sanani `pubDate` dan oladi — `publishedAt` dan emas.
    pubDate: hit.firstPublicationDate || '',
    guid: hit.pmid || hit.doi,
    key: hit.pmid ? `pmid:${hit.pmid}` : `doi:${hit.doi}`,
    feedId: 'europepmc',
    source: cfg.source || journalTitle || 'Europe PMC',
    sourceFull: cfg.sourceFull || journalTitle || 'Europe PMC',
    weight: cfg.weight ?? 1,
    pedsFeed: true,
    publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
    // Tayyor abstrakt — build-draft uni qayta so'ramaydi.
    abstract,
  };
}

/**
 * Oxirgi `months` oy ichidagi maqolalar, yangisidan boshlab. `pages` ta sahifa
 * olinadi (har biri 100 ta) — bir yilning hammasi emas, chunki yangi maqola
 * har doim ustun turadi va eskilari zaxira sifatida yetib ortadi.
 */
export async function fetchArchive(archiveConfig) {
  const cfg = archiveConfig || {};
  if (cfg.enabled === false) return [];

  const journals = cfg.journals || [];
  if (!journals.length) return [];

  const journalMap = new Map(journals.map((j) => [j.name.toLowerCase(), j]));
  const query = buildQuery(journals, cfg.months ?? 12);
  const pages = Math.max(1, cfg.pages ?? 3);

  const out = [];
  const seen = new Set();
  // `page` parametri Europe PMC'da e'tiborsiz qoladi — o'lchandi: 1, 2, 3
  // sahifalar aynan bir xil 100 ta natijani qaytardi. Ikkinchi sahifadan
  // boshlab faqat cursorMark ishlaydi.
  let cursor = '*';

  for (let page = 1; page <= pages; page++) {
    try {
      const url =
        `${SEARCH}?query=${encodeURIComponent(query)}` +
        `&resultType=core&format=json&pageSize=${PAGE_SIZE}` +
        `&cursorMark=${encodeURIComponent(cursor)}` +
        `&sort=${encodeURIComponent('P_PDATE_D desc')}`;

      const res = await fetchWithRetry(url, { timeoutMs: 30_000, accept: 'application/json' }, 2);
      const data = await res.json();
      const hits = data?.resultList?.result ?? [];

      for (const hit of hits) {
        const item = toItem(hit, journalMap);
        if (!item || seen.has(item.key)) continue;
        seen.add(item.key);
        out.push(item);
      }

      // Sahifa to'liq emas yoki kursor qimirlamadi — arxiv tugadi.
      const next = data?.nextCursorMark;
      if (hits.length < PAGE_SIZE || !next || next === cursor) break;
      cursor = next;
    } catch (err) {
      // Arxiv yiqilsa RSS bilan davom etamiz — post chiqishi to'xtamasligi kerak.
      log(`arxiv XATO (sahifa ${page}): ${err.message}`);
      break;
    }
  }

  log(`arxiv ok: europepmc → ${out.length} ta (oxirgi ${cfg.months ?? 12} oy)`);
  return out;
}
