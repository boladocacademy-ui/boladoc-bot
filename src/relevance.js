/**
 * CDC feedlari umumiy (butun aholi bo'yicha), shuning uchun ulardan faqat
 * pediatriyaga oid yozuvlarni ajratib olamiz. AAP/JAMA Peds feedlari peds:true —
 * ular filtrsiz o'tadi, faqat "chop etishga yaroqsiz" yozuvlar tashlanadi.
 */

const PEDS_TERMS = [
  'pediatric', 'paediatric', 'child', 'children', 'childhood', 'infant', 'infants',
  'newborn', 'neonat', 'toddler', 'adolescent', 'teen', 'youth', 'school-age',
  'schoolchildren', 'kindergarten', 'student', 'breastfeed', 'breast-feed',
  'human milk', 'immunization schedule', 'childhood vaccination', 'well-child',
  'birth defect', 'congenital', 'preterm', 'prematur', 'low birth weight',
  'sudden infant death', 'sids', 'kawasaki', 'bronchiolitis', 'croup',
  'otitis media', 'rsv', 'measles', 'pertussis', 'whooping cough', 'varicella',
  'rotavirus', 'hand, foot', 'autism', 'adhd', 'developmental delay',
  'maternal and child', 'perinatal', 'nicu', 'picu', 'aged 0-17', 'aged <18',
  'under 5', 'under age 18', 'boys and girls', 'day care', 'childcare',
];

/** Sarlavhasi shu naqshlarga mos yozuvlar maqola emas — ular postga yaramaydi. */
const JUNK_PATTERNS = [
  /^jama\s*pediatrics$/i,
  /^pediatrics$/i,
  /^(correction|erratum|errata|retraction)\b/i,
  /^(masthead|editorial board|table of contents|contents|front matter|back matter)/i,
  /^(this month in|highlights|in this issue|cover art|about the cover)/i,
  /^(instructions for authors|information for authors|acknowledg)/i,
  /^(index|masthead)/i,
  /^(job|career|classified)/i,
  /^error in /i,
  // Muharrirga xatlar va ularga javoblar — bular mustaqil maqola emas.
  /[—-]\s*reply$/i,
  /^(in reply|reply to)\b/i,
  /^(comment|letter|correspondence) (on|to|re)\b/i,
  // Audio/video yozuvlarida o'qiladigan matn yo'q.
  /\b(podcast|audio interview|video interview|jama medical news summary)\b/i,
  /^(patient page|jama patient page)/i,
];

/** Fikr-mulohaza janrlari — chiqarilishi mumkin, lekin tadqiqotdan keyin turadi. */
const OPINION_TERMS = [
  'viewpoint', 'editorial', 'invited commentary', 'commentary', 'perspective',
  'opinion', 'essay', 'a piece of my mind', 'special communication',
];

/** Klinik qiymati yuqori — postda ustuvor bo'lsin. */
const HIGH_VALUE_TERMS = [
  'guideline', 'clinical practice guideline', 'policy statement', 'recommendation',
  'consensus', 'technical report', 'protocol', 'randomized', 'trial',
  'meta-analysis', 'systematic review', 'cohort study', 'screening',
  'acip', 'advisory committee', 'update', 'safety', 'outbreak', 'surveillance',
];

function hay(item) {
  return `${item.title} ${item.description}`.toLowerCase();
}

export function isJunk(item) {
  const t = item.title.trim();
  if (t.length < 15) return true;
  return JUNK_PATTERNS.some((re) => re.test(t));
}

export function isPediatric(item) {
  if (item.pedsFeed) return true;
  const h = hay(item);
  return PEDS_TERMS.some((term) => h.includes(term));
}

/**
 * Ball: manba og'irligi + klinik qiymat + yangilik. Yuqori ball = avval chiqadi.
 */
export function scoreItem(item, { maxAgeDays }) {
  let score = item.weight * 10;

  const h = hay(item);
  for (const term of HIGH_VALUE_TERMS) {
    if (h.includes(term)) score += 4;
  }

  if (item.publishedAt) {
    const ageDays = (Date.now() - item.publishedAt.getTime()) / 86_400_000;
    // Yangi maqola eskisidan doim ustun; maxAgeDays ga yaqinlashgani sari yo'qoladi.
    score += Math.max(0, 25 - (ageDays / maxAgeDays) * 25);
  }

  for (const term of OPINION_TERMS) {
    if (h.includes(term)) {
      score -= 12;
      break;
    }
  }

  // Supplement sonlari odatda konferensiya tezislari — klinik qiymati pastroq.
  if (/supplement/i.test(item.link)) score -= 8;

  if (item.description && item.description.length > 200) score += 3;

  return score;
}

export function selectCandidates(items, { posted, maxAgeDays, limit }) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const seen = new Set();

  const pool = items.filter((it) => {
    if (posted.has(it.key)) return false;
    if (seen.has(it.key)) return false;
    if (isJunk(it)) return false;
    if (!isPediatric(it)) return false;
    if (it.publishedAt && it.publishedAt.getTime() < cutoff) return false;
    seen.add(it.key);
    return true;
  });

  const ranked = pool
    .map((it) => ({ ...it, score: scoreItem(it, { maxAgeDays }) }))
    .sort((a, b) => b.score - a.score);

  // Bir xil manbadan ketma-ket bir nechta variant chiqmasligi uchun aralashtiramiz.
  const bySource = new Map();
  for (const it of ranked) {
    if (!bySource.has(it.source)) bySource.set(it.source, []);
    bySource.get(it.source).push(it);
  }
  const diversified = [];
  let added = true;
  while (added && diversified.length < ranked.length) {
    added = false;
    for (const list of bySource.values()) {
      const next = list.shift();
      if (next) {
        diversified.push(next);
        added = true;
      }
    }
  }

  return diversified.slice(0, limit);
}
