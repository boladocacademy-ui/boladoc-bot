/**
 * Tarmoqsiz mantiqiy testlar: node src/selftest.js
 * Caption chegarasi, tasdiq o'qish, filtrlar va matn o'rash tekshiriladi.
 */
import { parseUpdate, enqueue } from './approvals.js';
import { buildCaption, visibleLength, CAPTION_LIMIT } from './caption.js';
import { normalizeUrl } from './util.js';
import { isJunk, isPediatric, blockedCategory, selectCandidates } from './relevance.js';

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}`);
  if (!cond) failed++;
}

const brand = {
  name: 'Boladoc Academy',
  handle: '@Boladoc_uz',
  phone: '+998908161498',
  instagram: 'https://www.instagram.com/boladoc_uz',
};
const item = {
  sourceFull: 'JAMA Pediatrics — Online First',
  link: 'https://jamanetwork.com/journals/jamapediatrics/fullarticle/2852527',
  pubDate: 'Mon, 03 Aug 2026 00:00:00 GMT',
  source: 'JAMA Pediatrics',
};

console.log('\n1) Caption chegarasi');
{
  const long = 'A'.repeat(200);
  const content = {
    title_uz: long.slice(0, 100),
    hook: long.slice(0, 160),
    bullets: [`🔹 ${long.slice(0, 138)}`, `📊 ${long.slice(0, 138)}`, `⏱ ${long.slice(0, 138)}`],
    takeaway: long.slice(0, 190),
    hashtags: ['#pediatriya', '#JAMA', '#bolalar', '#tadqiqot', '#BoladocAcademy'],
  };
  const cap = buildCaption(content, item, brand);
  check(
    `uzun matn ${visibleLength(cap)} ≤ ${CAPTION_LIMIT}`,
    visibleLength(cap) <= CAPTION_LIMIT,
  );
  check('link saqlandi', cap.includes(item.link));
  check('manba saqlandi', cap.includes('JAMA Pediatrics — Online First'));

  const short = buildCaption(
    { ...content, title_uz: 'Qisqa sarlavha', hook: 'Qisqa hook', bullets: ['🔹 bir', '📊 ikki', '⏱ uch'], takeaway: 'qisqa' },
    item,
    brand,
  );
  check('qisqa matnda 3 bullet ham qoldi', short.includes('🔹 bir') && short.includes('⏱ uch'));
}

console.log('\n1b) Tugash bloki va hashtaglar');
{
  const content = {
    title_uz: 'Sarlavha',
    hook: 'Hook',
    bullets: ['🔹 bir', '📊 ikki', '⏱ uch'],
    takeaway: 'xulosa',
    hashtags: ['#pediatriya', '#JAMA'],
  };
  const cap = buildCaption(content, item, brand);

  check('hashtaglar chiqmaydi', !cap.includes('#pediatriya') && !cap.includes('#JAMA'));
  check('telefon chiqadi', cap.includes('📞 +998908161498'));
  check('kanal handle chiqadi', cap.includes('😎 @Boladoc_uz'));
  check('Instagram havola bilan chiqadi',
    cap.includes('<a href="https://www.instagram.com/boladoc_uz">Instagram</a>'));

  const tail = cap.slice(cap.indexOf('🔗'));
  check('link va telefon orasida bo‘sh abzats bor', /<\/a>\n\n\n\n📞/.test(tail));
  check('tugash qatorlari alohida abzatsda',
    /📞 [^\n]+\n\n😎 @Boladoc_uz\n\n😎 <a /.test(cap));
  check('tugash bloki eng oxirida', cap.trimEnd().endsWith('>Instagram</a>'));

  const noExtras = buildCaption(content, item, { name: 'X', handle: '@x' });
  check('phone/instagram bo‘lmasa o‘sha qatorlar chiqmaydi',
    !noExtras.includes('📞') && !noExtras.includes('Instagram'));
  check('handle esa baribir chiqadi', noExtras.includes('😎 @x'));
}

console.log('\n1c) Havolani normallashtirish');
{
  const cdc = normalizeUrl('https://tools.cdc.gov/api/embed/downloader/download.asp?m=342778&amp;c=766070');
  check('RSS dagi &amp; ochiladi', cdc === 'https://tools.cdc.gov/api/embed/downloader/download.asp?m=342778&c=766070');

  const cap = buildCaption(
    { title_uz: 'T', hook: '', bullets: [], takeaway: 'x', hashtags: [] },
    { ...item, link: cdc },
    brand,
  );
  check('caption ichida &amp;amp; qolmaydi', !cap.includes('&amp;amp;'));
  check('caption ichida bir marta kodlanadi', cap.includes('m=342778&amp;c=766070'));
  check('oddiy havola o‘zgarmaydi',
    normalizeUrl('https://jamanetwork.com/a/b?x=1') === 'https://jamanetwork.com/a/b?x=1');
}

console.log('\n2) HTML xavfsizligi');
{
  const cap = buildCaption(
    {
      title_uz: 'Test <script>alert(1)</script> & CO2',
      hook: 'a < b > c',
      bullets: ['🔹 5 < 10'],
      takeaway: 'x & y',
      hashtags: ['#test'],
    },
    item,
    brand,
  );
  check('teglar qochirildi', !cap.includes('<script>') && cap.includes('&lt;script&gt;'));
  check('ampersand qochirildi', cap.includes('&amp; CO2'));
}

console.log('\n3) Tasdiqni o‘qish');
{
  const cb = (data, id = 1) => ({ update_id: id, callback_query: { id: 'q', data } });
  const txt = (text) => ({
    update_id: 1,
    message: { text, date: 1_786_000_000, chat: { id: 555 } },
  });
  const p = (u) => parseUpdate(u, 555, '2026-08-08');

  check('tugma: B tasdiqlandi',
    p(cb('ok:2026-08-08:1'))?.index === 1 && p(cb('ok:2026-08-08:1'))?.type === 'ok');
  check('tugma: o‘tkazib yuborish', p(cb('no:2026-08-08'))?.type === 'no');
  check('ESKI kundagi tugma ham qabul qilinadi',
    p(cb('ok:2026-07-31:0'))?.draftId === '2026-07-31');
  check('eski tugmaning indeksi saqlanadi', p(cb('ok:2026-07-31:1'))?.index === 1);
  check('callbackId qaytadi', p(cb('ok:2026-08-08:0'))?.callbackId === 'q');
  check('matn: "B" → 2-variant', p(txt('B'))?.index === 1);
  check('matn eng oxirgi draftga tegishli', p(txt('B'))?.draftId === '2026-08-08');
  check("matn: \"yo'q\" → o‘tkazib yuborish", p(txt('yo‘q'))?.type === 'no');
  check('begona chatdan kelgan matn hisobga olinmaydi',
    parseUpdate({ update_id: 1, message: { text: 'A', date: 1, chat: { id: 999 } } }, 555, '2026-08-08')
      === null);
  check('tanish bo‘lmagan matn e’tiborsiz qoladi', p(txt('salom')) === null);
}

console.log('\n3b) Navbat');
{
  const opt = (key) => ({ key, label: 'A', title: `T-${key}`, fileId: 'f', caption: 'c' });
  const q = { items: [], skipNext: false };
  const posted = new Set(['eski']);

  check('birinchi tasdiq navbatga tushadi', enqueue(q, opt('a1'), posted).ok === true);
  check('ikkinchi tasdiq ham tushadi (A ham, B ham)', enqueue(q, opt('b1'), posted).ok === true);
  check('navbatda 2 ta post bor', q.items.length === 2);
  check('tartib saqlanadi', q.items[0].key === 'a1' && q.items[1].key === 'b1');

  const again = enqueue(q, opt('a1'), posted);
  check('bir variant ikki marta navbatga tushmaydi', again.ok === false);
  check('takror bosilganda o‘rni aytiladi', again.text.includes('1-o‘rin') || again.text.includes("1-o'rin"));
  check('navbat uzunligi o‘zgarmadi', q.items.length === 2);

  check('allaqachon chiqarilgani qaytarilmaydi', enqueue(q, opt('eski'), posted).ok === false);
  check('arxivda topilmagan variant rad etiladi', enqueue(q, null, posted).ok === false);
  check('navbatga qo‘shilganda o‘rin raqami aytiladi',
    enqueue(q, opt('c1'), posted).text.includes('3'));
}

console.log('\n4) Filtrlar');
{
  check('"—Reply" tashlanadi', isJunk({ title: 'RAASi in Pediatric CKD—Reply' }));
  check('"Correction" tashlanadi', isJunk({ title: 'Correction to: Neonatal Sepsis Trial' }));
  check('normal maqola qoladi', !isJunk({ title: 'Erythropoietin for Neonatal Hypoxic-Ischemic Encephalopathy' }));
  check('CDC pediatrik maqola o‘tadi',
    isPediatric({ pedsFeed: false, title: 'Rubella and Congenital Rubella Syndrome', description: 'infants' }));
  check('CDC kattalar maqolasi o‘tmaydi',
    !isPediatric({ pedsFeed: false, title: 'Workplace Poisoning Among Adults', description: 'occupational exposure' }));
}

console.log('\n5) Taqiqlangan mavzular');
{
  const b = (title, description = '') => blockedCategory({ title, description });

  check('transgender maqolasi tashlanadi',
    b('Puberty Suppression in Transgender Adolescents') === 'gender');
  check('suitsid maqolasi tashlanadi',
    b('Suicidal Ideation Among Adolescents After Discharge') === 'zarar');
  check('veyp maqolasi tashlanadi',
    b('E-cigarette Use and Respiratory Symptoms in Teens') === 'zarar');
  check('qurol maqolasi tashlanadi',
    b('Firearm Injuries Among Children Aged 0-17') === 'aqsh');
  check('Medicaid maqolasi tashlanadi',
    b('Medicaid Unwinding and Pediatric Coverage Loss') === 'aqsh');
  check('taqiq tavsifdan ham topiladi',
    b('Screening Outcomes in a Large Cohort', 'the cohort examined cannabis exposure') === 'zarar');

  // Bexosdan tushib qolmasligi kerak bo'lgan maqolalar:
  check('oddiy pediatriya maqolasi qoladi',
    b('Erythropoietin for Neonatal Hypoxic-Ischemic Encephalopathy') === null);
  check('"gender farqlari" bexosdan tashlanmaydi',
    b('Sex and Gender Differences in Childhood Asthma Severity') === null);
  check('"begun" so‘zi qurol deb hisoblanmaydi',
    b('Vaccination Has Begun in Rural Districts') === null);
  check('reproduktiv salomatlik qoladi (taqiqlanmagan)',
    b('HPV Vaccination Coverage Among Adolescents') === null);

  check('config blockedExtra ishlaydi',
    blockedCategory({ title: 'A Trial of Homeopathy in Infants', description: '' }, ['homeopathy'])
      === 'qo‘shimcha');
  check('blockedExtra bo‘sh bo‘lsa ta’sir qilmaydi',
    blockedCategory({ title: 'A Trial of Homeopathy in Infants', description: '' }, []) === null);
}

console.log('\n6) Tanlov');
{
  const mk = (o) => ({
    title: 'Randomized Trial of Neonatal Screening Strategies in Infants',
    description: 'x'.repeat(300),
    weight: 3, pedsFeed: true, publishedAt: new Date(), ...o,
  });
  const items = [
    mk({ key: 'a', source: 'AAP' }),
    mk({ key: 'b', source: 'AAP' }),
    mk({ key: 'c', source: 'JAMA Pediatrics' }),
  ];
  const picked = selectCandidates(items, { posted: new Set(['a']), maxAgeDays: 45, limit: 2 });
  check('chiqarilgani qayta tanlanmaydi', !picked.some((p) => p.key === 'a'));
  check('manbalar aralashtiriladi', new Set(picked.map((p) => p.source)).size === 2);

  const old = selectCandidates(
    [mk({ key: 'z', source: 'AAP', publishedAt: new Date('2020-01-01') })],
    { posted: new Set(), maxAgeDays: 45, limit: 2 },
  );
  check('eski maqola tashlanadi', old.length === 0);

  const seen = [];
  const withBlocked = selectCandidates(
    [
      mk({ key: 'ok', source: 'AAP' }),
      mk({ key: 'bad', source: 'JAMA Pediatrics', title: 'Gender-Affirming Care in Adolescents' }),
    ],
    { posted: new Set(), maxAgeDays: 45, limit: 5, onBlocked: (it, c) => seen.push([it.key, c]) },
  );
  check('taqiqlangan maqola nomzodlarga kirmaydi', !withBlocked.some((p) => p.key === 'bad'));
  check('onBlocked chaqiriladi', seen.length === 1 && seen[0][0] === 'bad' && seen[0][1] === 'gender');
}

console.log(`\n${failed === 0 ? '✅ Hammasi o‘tdi' : `❌ ${failed} ta test yiqildi`}\n`);
process.exit(failed === 0 ? 0 : 1);
