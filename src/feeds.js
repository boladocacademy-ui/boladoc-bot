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

/**
 * Maqola sahifasidan abstraktni olishga urinadi — Gemini'ga kontekst boyroq bo'lishi uchun.
 * Muvaffaqiyatsiz bo'lsa RSS description ishlatiladi, xato tashlanmaydi.
 */
export async function fetchAbstract(url) {
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
