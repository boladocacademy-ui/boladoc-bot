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

/**
 * TAQIQLANGAN MAVZULAR — bu iboralar sarlavha yoki tavsifda uchrasa, maqola
 * tanlovga umuman kirmaydi (ball ham hisoblanmaydi).
 *
 * Naqshlar substring bo'yicha, kichik harfda solishtiriladi. Shuning uchun
 * "gender" yoki "gun" kabi yolg'iz so'zlar YOZILMAYDI — ular "gender
 * farqlari" yoki "begun" kabi bexosdan mos kelib, foydali maqolani ham
 * tashlab yuboradi. Har doim ikki so'zli ibora yoki uzun o'zak yozing.
 *
 * Ro'yxatni tahrirlash: shu yerdan olib tashlang yoki config.json dagi
 * "blockedExtra" ga yangisini qo'shing.
 */
export const BLOCKED_TOPICS = {
  // 1) Gender identifikatsiyasi va transgender mavzulari
  gender: [
    'transgender', 'transsexual', 'cisgender', 'nonbinary', 'non-binary',
    'gender identity', 'gender-affirming', 'gender affirming',
    'gender dysphoria', 'gender-diverse', 'gender diverse', 'gender minority',
    'puberty blocker', 'puberty suppression', 'pubertal suppression',
    'sexual orientation', 'sexual minority', 'lgbt',
  ],

  // 2) O'z joniga qasd, o'z-o'ziga zarar va giyohvand moddalar
  zarar: [
    'suicid', 'self-harm', 'self harm', 'self-injur', 'nonsuicidal',
    'overdose', 'opioid', 'fentanyl', 'naloxone', 'heroin', 'cocaine',
    'methamphetamine', 'cannabis', 'marijuana', 'addiction',
    'vaping', 'vape', 'e-cigarette', 'electronic cigarette', 'nicotine',
    'tobacco', 'smoking', 'secondhand smoke',
    'alcohol use', 'alcohol consumption', 'binge drinking', 'underage drinking',
    'substance use', 'substance abuse', 'drug use', 'illicit drug',
  ],

  // 3) AQShga xos siyosat va statistika — O'zbekiston auditoriyasiga foydasi kam
  aqsh: [
    'firearm', 'gun violence', 'gun safety', 'gun ownership', 'handgun',
    'school shooting', 'mass shooting',
    'medicaid', 'medicare', 'affordable care act', 'health insurance',
    'uninsured', 'insurance coverage',
    'racism', 'racial disparit', 'ethnic disparit', 'racial and ethnic',
    'immigrant', 'immigration', 'deportation', 'undocumented',
  ],
};

const BLOCKED_FLAT = Object.entries(BLOCKED_TOPICS).flatMap(
  ([category, terms]) => terms.map((term) => [term, category]),
);

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

/**
 * Taqiqlangan mavzu topilsa — kategoriya nomini, aks holda null qaytaradi.
 * Nomini qaytarish sababi: nima uchun tashlanganini logda ko'rsatish uchun.
 */
export function blockedCategory(item, extraBlocked = []) {
  const h = hay(item);
  for (const [term, category] of BLOCKED_FLAT) {
    if (h.includes(term)) return category;
  }
  for (const term of extraBlocked) {
    const t = String(term).trim().toLowerCase();
    if (t && h.includes(t)) return 'qo‘shimcha';
  }
  return null;
}

export function isPediatric(item) {
  if (item.pedsFeed) return true;
  const h = hay(item);
  return PEDS_TERMS.some((term) => h.includes(term));
}

/** Yangilik ustunligi shu kundan keyin tugaydi (tanlov oynasidan mustaqil). */
const FRESH_DAYS = 60;

/**
 * Ball: manba og'irligi + klinik qiymat + yangilik. Yuqori ball = avval chiqadi.
 */
export function scoreItem(item) {
  let score = item.weight * 10;

  const h = hay(item);
  for (const term of HIGH_VALUE_TERMS) {
    if (h.includes(term)) score += 4;
  }

  if (item.publishedAt) {
    const ageDays = (Date.now() - item.publishedAt.getTime()) / 86_400_000;
    // Yangilik bali maxAgeDays ga BOG'LANMAYDI. Ilgari bog'langan edi va oyna
    // bir yilga ochilganda 45 kunlik maqola ham deyarli yangi kabi ball olardi
    // — natijada eski maqola bugungisini bosib ketishi mumkin edi. Endi
    // gradient qat'iy: 60 kundan keyin yangilik ustunligi tugaydi va eski
    // maqolalar faqat zaxira bo'lib qoladi.
    score += Math.max(0, 25 - (ageDays / FRESH_DAYS) * 25);
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

/**
 * Bir maqolaning xati va javobi jurnal feedida bir xil sarlavha bilan bir
 * necha marta chiqadi ("RAASi in Pediatric CKD" — 3 marta). Kalitlari har xil
 * bo'lgani uchun kalit bo'yicha dedupe ularni tutmaydi.
 */
export function titleKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function selectCandidates(
  items,
  {
    posted,
    maxAgeDays,
    limit,
    extraBlocked = [],
    onBlocked,
    deprioritize,
    // Bir maqola RSS'da va Europe PMC arxivida turli kalit bilan keladi
    // (JAMA'da "2852670", arxivda "pmid:42603200"). Shuning uchun chiqarilgani
    // va oldin taklif qilingani sarlavha bo'yicha ham tekshiriladi — aks holda
    // allaqachon kanalga chiqqan maqola ikkinchi marta chiqib ketardi.
    postedTitles,
    deprioritizeTitles,
  },
) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const seen = new Set();
  const seenTitles = new Set();

  const pool = items.filter((it) => {
    if (posted.has(it.key)) return false;
    if (seen.has(it.key)) return false;
    const tk = titleKey(it.title);
    if (postedTitles?.has(tk)) return false;
    if (seenTitles.has(tk)) return false;
    if (isJunk(it)) return false;
    if (!isPediatric(it)) return false;
    const blocked = blockedCategory(it, extraBlocked);
    if (blocked) {
      seen.add(it.key);
      if (onBlocked) onBlocked(it, blocked);
      return false;
    }
    if (it.publishedAt && it.publishedAt.getTime() < cutoff) return false;
    seen.add(it.key);
    seenTitles.add(tk);
    return true;
  });

  const ranked = pool
    .map((it) => ({ ...it, score: scoreItem(it) }))
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

  // Oldin taklif qilingan, lekin tasdiqlanmagan maqolalar oxiriga suriladi:
  // yangilari tugasa ular yana chiqadi, lekin har kuni bir xil variant emas.
  if (deprioritize?.size || deprioritizeTitles?.size) {
    const wasOffered = (it) =>
      Boolean(deprioritize?.has(it.key)) || Boolean(deprioritizeTitles?.has(titleKey(it.title)));
    const fresh = diversified.filter((it) => !wasOffered(it));
    const old = diversified.filter(wasOffered);
    return [...fresh, ...old].slice(0, limit);
  }

  return diversified.slice(0, limit);
}
