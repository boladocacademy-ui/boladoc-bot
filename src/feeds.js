import { XMLParser } from 'fast-xml-parser';
import { fetchWithRetry, stripHtml, normalizeUrl, dedupeKey, log } from './util.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // CDC feedida mingdan ortiq HTML entity bor — parser himoyasi ishga tushib feedni yiqitadi.
  // Entitylarni o'zimiz stripHtml() da ochamiz.
  processEntities: false,
});

function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function pickText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v['#text'] ?? v['@_href'] ?? '');
  return '';
}

/** RSS 2.0 va Atom — ikkalasini ham qo'llab-quvvatlaydi (JAMA/AAP/CDC har xil beradi). */
function extractItems(xml) {
  const doc = parser.parse(xml);
  if (doc?.rss?.channel) {
    return asArray(doc.rss.channel.item).map((it) => ({
      title: stripHtml(pickText(it.title)),
      link: normalizeUrl(pickText(it.link)),
      guid: pickText(it.guid),
      description: stripHtml(pickText(it.description)),
      pubDate: pickText(it.pubDate) || pickText(it['dc:date']),
    }));
  }
  if (doc?.feed) {
    return asArray(doc.feed.entry).map((it) => {
      const links = asArray(it.link);
      const alt = links.find((l) => l?.['@_rel'] === 'alternate') || links[0];
      return {
        title: stripHtml(pickText(it.title)),
        link: normalizeUrl(pickText(alt)),
        guid: pickText(it.id),
        description: stripHtml(pickText(it.summary) || pickText(it.content)),
        pubDate: pickText(it.updated) || pickText(it.published),
      };
    });
  }
  return [];
}

export async function fetchFeed(feed) {
  try {
    const res = await fetchWithRetry(feed.url, {
      accept: 'application/rss+xml, application/xml, text/xml, */*',
    });
    const xml = await res.text();
    const items = extractItems(xml)
      .filter((it) => it.title && it.link)
      .map((it) => ({
        ...it,
        key: dedupeKey(it),
        feedId: feed.id,
        source: feed.source,
        sourceFull: feed.sourceFull,
        weight: feed.weight ?? 1,
        pedsFeed: !!feed.peds,
        publishedAt: it.pubDate ? new Date(it.pubDate) : null,
      }));
    log(`feed ok: ${feed.id} → ${items.length} ta`);
    return items;
  } catch (err) {
    // Bitta manba yiqilsa butun post to'xtab qolmasligi kerak.
    log(`feed XATO: ${feed.id} — ${err.message}`);
    return [];
  }
}

export async function fetchAllFeeds(feeds) {
  const results = await Promise.all(feeds.map(fetchFeed));
  return results.flat();
}

const EPMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/**
 * Shundan qisqa abstraktda natija bo'lmaydi — u RSS'ning bir jumlalik
 * "bu tadqiqot X ni baholaydi" tavsifi xolos. Bunday matndan yozilgan post
 * "tadqiqot o'tkazildi" dan nariga o'tmaydi.
 */
export const MIN_ABSTRACT = 400;

/**
 * Strukturali abstraktda bo'limlar qo'shilib ketadi: "...treatment.ObjectiveTo evaluate..."
 * Gemini uchun ularni ajratib beramiz — qaysi jumla NATIJA ekani aniq ko'rinsin.
 * Uzunroq nomlar avval turadi, aks holda "Design" "Design, setting..." ni yeb qo'yadi.
 */
const ABSTRACT_SECTIONS = [
  'Design, setting, and participants', 'Main outcomes and measures',
  'Conclusions and relevance', 'Trial registration', 'Main outcome measures',
  'Importance', 'Background', 'Objectives', 'Objective', 'Interventions',
  'Intervention', 'Methods', 'Results', 'Conclusions', 'Conclusion',
];

function tidyStructuredAbstract(text) {
  let out = stripHtml(text);
  for (const name of ABSTRACT_SECTIONS) {
    out = out.replace(new RegExp(`${name}(?=[A-Z])`, 'g'), `\n\n${name}: `);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function normTitle(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Sarlavha bo'yicha topilgan yozuv HAQIQATAN o'sha maqolami?
 * Europe PMC ko'pincha to'liq sarlavhani beradi, RSS esa qisqartirilganini
 * ("...: The DROPROP Randomized Clinical Trial" qismisiz) — shuning uchun
 * biri ikkinchisining boshlanishi bo'lsa ham yetarli deb hisoblaymiz.
 */
function sameArticle(rssTitle, foundTitle) {
  const a = normTitle(rssTitle);
  const b = normTitle(foundTitle);
  if (!a || !b || a.length < 25 || b.length < 25) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/**
 * Europe PMC — bepul, kalit talab qilmaydi, JAMA/AAP/MMWR maqolalarining
 * to'liq strukturali abstraktini beradi. Nashriyot saytlari botni bloklagani
 * uchun (JAMA → HTTP 403) asosiy manba shu.
 */
export async function fetchAbstractFromEuropePmc(title) {
  try {
    const q = encodeURIComponent(`TITLE:"${title.replace(/"/g, '')}"`);
    const res = await fetchWithRetry(
      `${EPMC_SEARCH}?query=${q}&resultType=core&format=json&pageSize=3`,
      { timeoutMs: 25_000, accept: 'application/json' },
      2,
    );
    const data = await res.json();
    for (const hit of data?.resultList?.result ?? []) {
      if (!hit.abstractText) continue;
      if (!sameArticle(title, hit.title)) continue;
      return tidyStructuredAbstract(hit.abstractText).slice(0, 4000);
    }
    return '';
  } catch (err) {
    log(`Europe PMC xatosi: ${err.message}`);
    return '';
  }
}

/**
 * Maqola sahifasidan abstraktni olishga urinadi — Gemini'ga kontekst boyroq bo'lishi uchun.
 * Muvaffaqiyatsiz bo'lsa RSS description ishlatiladi, xato tashlanmaydi.
 */
export async function fetchAbstractFromPage(url) {
  try {
    const res = await fetchWithRetry(url, { timeoutMs: 30_000, accept: 'text/html' }, 2);
    const html = await res.text();

    const metas = [
      /<meta[^>]+name=["'](?:dc\.description|description|citation_abstract)["'][^>]+content=["']([^"']{80,})["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{80,})["']/i,
    ];
    for (const re of metas) {
      const m = html.match(re);
      if (m) return stripHtml(m[1]).slice(0, 2500);
    }

    const sect = html.match(
      /<(section|div)[^>]*(?:abstract|Abstract)[^>]*>([\s\S]{200,6000}?)<\/\1>/,
    );
    if (sect) return stripHtml(sect[2]).slice(0, 2500);

    return '';
  } catch {
    return '';
  }
}

/**
 * Abstraktni ikki manbadan qidiradi. Europe PMC birinchi: u NATIJA va XULOSA
 * bo'limlari bilan to'liq matn beradi, nashriyot sahifasidagi og:description
 * esa ko'pincha bir jumlalik "bu tadqiqot X ni baholaydi" bo'ladi — undan
 * natijali post yozib bo'lmaydi.
 */
export async function fetchAbstract(url, title) {
  if (title) {
    const epmc = await fetchAbstractFromEuropePmc(title);
    if (epmc && epmc.length >= 300) {
      log(`abstrakt: Europe PMC (${epmc.length} belgi)`);
      return epmc;
    }
  }
  const page = await fetchAbstractFromPage(url);
  if (page) log(`abstrakt: nashriyot sahifasi (${page.length} belgi)`);
  return page;
}
