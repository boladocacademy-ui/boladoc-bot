import { Resvg } from '@resvg/resvg-js';
import { fetchWithRetry, escapeHtml, log } from './util.js';

const FONT_STACK = 'DejaVu Sans, Noto Sans, Segoe UI, Arial, Helvetica, sans-serif';

const THEME = {
  deep: '#07202B',
  deepAlt: '#0C3242',
  accent: '#2DD4BF',
  accentSoft: '#7DE8DA',
  text: '#FFFFFF',
  muted: '#A9C7D1',
};

const SOURCE_COLORS = {
  AAP: '#3B82F6',
  'JAMA Pediatrics': '#8B5CF6',
  'CDC MMWR': '#F59E0B',
  CDC: '#F59E0B',
};

/**
 * SVG matnni avtomatik o'ramaydi — qatorlarni o'zimiz bo'lamiz.
 * Kenglikni taxminan hisoblaymiz: keng harflar uchun koeffitsiyent kattaroq.
 */
function charWidth(ch, size) {
  if ('MWmw@'.includes(ch)) return size * 0.85;
  if ('ABCDEFGHIJKLNOPQRSTUVXYZ0123456789'.includes(ch)) return size * 0.63;
  if ('iljtfrI.,:;\'"| '.includes(ch)) return size * 0.30;
  return size * 0.54;
}

function measure(text, size) {
  let w = 0;
  for (const ch of text) w += charWidth(ch, size);
  return w;
}

function wrapText(text, size, maxWidth, maxLines) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let cur = '';

  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (measure(candidate, size) <= maxWidth || !cur) {
      cur = candidate;
    } else {
      lines.push(cur);
      cur = word;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  if (lines.length === maxLines) {
    // Sig'magan qismni oxirgi qatorda uch nuqta bilan ko'rsatamiz.
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) {
      let last = lines[maxLines - 1];
      while (measure(`${last}…`, size) > maxWidth && last.includes(' ')) {
        last = last.slice(0, last.lastIndexOf(' '));
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

async function fetchAiImage(prompt, width, height, seed) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&nologo=true&model=flux&seed=${seed}`;
  const res = await fetchWithRetry(url, { timeoutMs: 120_000, accept: 'image/*' }, 2);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error(`juda kichik rasm: ${buf.length} bayt`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
}

function buildSvg({ width, height, imgDataUri, content, item, dateText }) {
  const pad = 72;
  // Chapda matn paneli, o'ngda illyustratsiya. Matn hech qachon rasm ustiga tushmaydi.
  const split = imgDataUri ? Math.round(width * 0.58) : width;
  const boxWidth = split - pad - 48;
  const sourceColor = SOURCE_COLORS[item.source] || THEME.accent;

  const titleSize = content.card_title.length > 46 ? 50 : 58;
  const titleLines = wrapText(content.card_title, titleSize, boxWidth, 4);
  const titleBlockHeight = titleLines.length * titleSize * 1.22;

  // Sarlavha blokini vertikal markazga yaqin joylashtiramiz, pastda brend uchun joy qoldirib.
  const titleTop = Math.round((height - titleBlockHeight) / 2) + 10;

  const imgLayer = imgDataUri
    ? `<g clip-path="url(#rightPanel)">
    <image href="${imgDataUri}" x="${split}" y="0" width="${width - split}" height="${height}"
           preserveAspectRatio="xMidYMid slice"/>
    <rect x="${split}" y="0" width="${width - split}" height="${height}"
          fill="${THEME.deep}" opacity="0.24"/>
    <!-- Fade faqat rasm ichida — panelga tushsa u yerda qorong'i tasma paydo bo'ladi. -->
    <rect x="${split}" y="0" width="110" height="${height}" fill="url(#fade)"/>
  </g>
  <rect x="${split - 2}" y="0" width="3" height="${height}" fill="${THEME.accent}" opacity="0.6"/>`
    : '';

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${titleTop + i * titleSize * 1.22 + titleSize}"
               font-family="${FONT_STACK}" font-size="${titleSize}" font-weight="700"
               fill="${THEME.text}">${escapeHtml(line)}</text>`,
    )
    .join('\n    ');

  const badgeText = item.source.toUpperCase();
  const badgeWidth = Math.round(measure(badgeText, 22) + 44);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="plain" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${THEME.deepAlt}"/>
      <stop offset="100%" stop-color="${THEME.deep}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${THEME.deep}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${THEME.deep}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="rightPanel">
      <rect x="${split}" y="0" width="${width - split}" height="${height}"/>
    </clipPath>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#plain)"/>
  ${imgLayer}

  <rect x="0" y="0" width="10" height="${height}" fill="${THEME.accent}"/>

  <rect x="${pad}" y="${pad - 34}" width="${badgeWidth}" height="42" rx="21" fill="${sourceColor}"/>
  <text x="${pad + 22}" y="${pad - 5}" font-family="${FONT_STACK}" font-size="22"
        font-weight="700" fill="#FFFFFF" letter-spacing="1.5">${escapeHtml(badgeText)}</text>

  <text x="${pad}" y="${pad + 52}" font-family="${FONT_STACK}" font-size="21"
        font-weight="700" fill="${THEME.accentSoft}"
        letter-spacing="4">${escapeHtml(content.card_topic)}</text>

  ${titleTspans}

  <rect x="${pad}" y="${height - 118}" width="64" height="4" fill="${THEME.accent}"/>
  <text x="${pad}" y="${height - 74}" font-family="${FONT_STACK}" font-size="27"
        font-weight="700" fill="${THEME.text}">Boladoc Academy</text>
  <text x="${pad}" y="${height - 44}" font-family="${FONT_STACK}" font-size="19"
        fill="${THEME.muted}">Pediatriya · Xalqaro standartlar</text>

  <text x="${split - 48}" y="${height - 44}" text-anchor="end"
        font-family="${FONT_STACK}" font-size="19"
        fill="${THEME.muted}">${escapeHtml(dateText)}</text>
</svg>`;
}

function renderPng(svg, width) {
  const resvg = new Resvg(svg, {
    background: THEME.deep,
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return resvg.render().asPng();
}

/**
 * AI fon + brendli kartochka. AI rasm olinmasa gradient fon bilan davom etadi —
 * rasmsiz post chiqmasligi kerak.
 */
export async function buildImage({ content, item, dateText, imageConfig, seed }) {
  const width = imageConfig?.width ?? 1280;
  const height = imageConfig?.height ?? 720;

  let imgDataUri = null;
  if (imageConfig?.aiBackground !== false) {
    try {
      // O'ng panel tik (portret) shaklda — rasmni ham shu nisbatda so'raymiz,
      // aks holda kesilganda kompozitsiya buziladi.
      imgDataUri = await fetchAiImage(content.image_prompt, 768, 1024, seed);
      log('AI illyustratsiya olindi');
    } catch (err) {
      log(`AI illyustratsiya olinmadi, faqat gradient — ${err.message}`);
    }
  }

  const svg = buildSvg({ width, height, imgDataUri, content, item, dateText });
  return renderPng(svg, width);
}
