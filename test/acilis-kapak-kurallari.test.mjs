// AÇILIŞ VE KAPAK KURALLARI (27 Ekim 2026, kanalların Studio eğrileri ve tıklama oranları). Kullanıcı: "ekle hepsini".
//   Açılış (0:30'da kalan): Panama %85 (rakamlı çelişki), Bakker %65 (tarih + karar), France %55 (üç maddelik vaat + süreç
//   cümlesi), Hastings %20 ("Nineteen days." "October 2026. A queue outside the British Museum…").
//   Kapak (tıklama): "PARIS UNDER CURFEW" A/B testini kazandı; "19 DAYS. ONE CROWN" %1,3; adı geçmeyen bakan portresi %1,1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-hook-thumb-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const L = await import('../src/pipeline/docu-lint.js');
const P = await import('../src/pipeline/docu-package.js');
const S = await import('../src/pipeline/docu-script.js');

const lines = (...t) => t.map((say) => ({ type: 'photo', say }));
// Gerçek açılışlar (altyazılardan).
const PANAMA = lines('Two months ago, a magnitude 7.4 earthquake shook Colombia.', 'More than a hundred people died.', 'On Friday, Panama was hit by something stronger.', 'A 7.7.', 'Roads collapsed.', 'A building fell onto parked cars.', '188 schools were damaged.', 'And yet, as of today, no one in Panama has been reported killed.', 'It comes down to three things: where it hit, when it hit, and how the ground moved.');
const FRANCE = lines("This is Paris on Saturday night, in France's worst weekend of unrest in years.", 'Afterwards, the Prime Minister said: no one was killed, and that is a miracle.', 'But that weekend, Paris police reported a death from a heart attack, without details.', 'So how did France get here, and is it over?', "By the end, you'll know what actually set this off, exactly what the curfews in Paris and other cities cover, and which of the numbers and clips going around can be trusted.", 'As I record this, the numbers are still changing.', "So I'll keep three things apart: what's established, what's argued over, and what nobody knows yet.");
const HASTINGS = lines('Nineteen days.', 'That is all it took to lose England.', 'October 2026.', 'A queue outside the British Museum.', 'Inside, a strip of cloth seventy metres long.', 'This is 1066, and the nineteen days that changed England.', 'In nineteen days, a king won a war.', 'He marched nearly four hundred miles.', 'And he lost his crown.');
const BAKKER = lines('October fifth, 1989.', 'In Charlotte, North Carolina, a jury finds TV preacher Jim Bakker guilty on all twenty-four counts.', 'Thirty-seven years later, to the day… Jim Bakker died.', 'He was eighty-six.', "This is how a thousand-dollar promise became a one-hundred-fifty-eight-million-dollar fraud.");
const HIST = L.hookContext({ job: { topic: '1066: The 19 Days That Changed England' }, thisYear: 2026 });

test('Panama ve Bakker açılışı temiz; France liste vaat + sayısız ilk 15 sn; Hastings bugüne sapıyor', () => {
  assert.deepEqual(L.hookErrors(PANAMA, L.hookContext({ job: { topic: "Panama's 7.7 Earthquake", docuFormat: 'news' }, thisYear: 2026 })), []);
  assert.deepEqual(L.hookErrors(BAKKER, L.hookContext({ job: { topic: 'Jim Bakker: The Preacher Who Sold Heaven Twice' }, thisYear: 2026 })), []);
  const fr = L.hookErrors(FRANCE, L.hookContext({ job: { topic: 'France Under Curfew', docuFormat: 'news' }, thisYear: 2026 }));
  assert.ok(fr.some((x) => x.kind === 'meta' && /liste vaat/.test(x.detail)), JSON.stringify(fr));
  assert.ok(fr.some((x) => x.kind === 'hook-number'));
  const h = L.hookErrors(HASTINGS, HIST);
  assert.ok(h.some((x) => x.kind === 'hook-modern' && /October 2026/.test(x.detail)), JSON.stringify(h));
  assert.ok(!h.some((x) => x.kind === 'hook-number'), '"Nineteen" bir sayı');
});

test('tek kısa vaat serbest; ikinci vaat ve önsöz yakalanır', () => {
  const one = lines('In 1889, a dam above Johnstown held back a lake.', 'On May 31, it gave way.', "By the end, you'll know why the dam failed on the one night it mattered.");
  assert.deepEqual(L.hookErrors(one, {}), []);
  const two = lines('In 1889, a dam above Johnstown held back a lake.', "By the end, you'll know why it failed.", "You'll also see who paid for it.", 'Stay with me, because the answer is not the rain.');
  const e = L.hookErrors(two, {});
  assert.ok(e.some((x) => /ikinci vaat/.test(x.detail)));
  assert.ok(e.some((x) => /önsöz: "Stay with me"/.test(x.detail)));
});

test('haber ve bu yıla bağlı tarih konusu bugünle açılabilir', () => {
  assert.ok(!L.hookErrors(HASTINGS, { ...HIST, news: true }).some((x) => x.kind === 'hook-modern'));
  const peg = L.hookContext({ job: { topic: 'Chernobyl 1986: What Divers Found in 2026' }, thisYear: 2026 });
  assert.equal(peg.peg, true);
  assert.ok(!L.hookErrors(HASTINGS, peg).some((x) => x.kind === 'hook-modern'));
});

test('kod son çare olarak önsözü ve süreç cümlesini keser, tek vaadi bırakır', () => {
  const sc = lines('So how did France get here?', "By the end, you'll know what set this off.", 'As I record this, the numbers are still changing.', "Let's dive in. Paris police counted 550,000.");
  assert.equal(L.stripHookPreamble(sc), 2);
  assert.equal(sc[1].say, "By the end, you'll know what set this off.");
  assert.equal(sc[2].say, '');
  assert.equal(sc[3].say, 'Paris police counted 550,000.');
});

test('açılış bulguları editörün ikinci turuna girer', () => {
  const kinds = L.scriptLint(HASTINGS, { hook: HIST }).map((x) => x.kind);
  assert.ok(kinds.includes('hook-modern'));
  assert.ok(!L.scriptLint(HASTINGS).some((x) => x.kind === 'hook-modern'), 'bağlam verilmezse kural çalışmaz (eski çağrılar)');
  for (const k of ['hook-number', 'hook-modern', 'meta']) assert.ok(S.SECOND_ROUND_KINDS.has(k), k);
});

// Kapak: anlatımda iki kez geçen özel adlar + yıl.
const HASTINGS_STORY = lines('King Harold marched north.', 'At Stamford Bridge, Harold won.', 'Then William landed in Sussex.', 'William and Harold met near Hastings.', 'By dusk, England had a new king and Hastings a new name.');
const anchorH = { names: ['days', 'changed', 'england'], year: '1066' };
const thumbs = (texts, extra = {}) => texts.map((text, i) => ({ hero: 'c1', layout: ['hero', 'number', 'document'][i], text, ...(i === 1 ? { number: '19' } : {}), ...extra }));

test('kapağın sözleri konunun adını ya da yılını taşır', () => {
  const names = L.thumbNames(HASTINGS_STORY, anchorH);
  assert.equal(names[0], '1066');
  for (const n of ['harold', 'william', 'hasting']) assert.ok(names.includes(n), n);
  assert.ok(!names.includes('october') && !names.includes('days'));
  const bad = P.thumbStoryErrors(thumbs(['Days. One Crown', 'Days', 'Lost It']), { scenes: HASTINGS_STORY, anchor: anchorH });
  assert.equal(bad.filter((x) => /konuyu adlandırmıyor/.test(x)).length, 3);
  assert.deepEqual(P.thumbStoryErrors(thumbs(['1066: England Lost', 'Days Harold Had', 'William Wins']), { scenes: HASTINGS_STORY, anchor: anchorH }), []);
  const panama = lines('Panama shook.', 'In Panama, roads fell.', 'Colombia had lost more.', 'Colombia mourned.');
  assert.deepEqual(P.thumbStoryErrors([{ hero: 'c1', layout: 'split', text: 'Stronger. Safer?', labels: ['7.4 Colombia', '7.7 Panama'] }], { scenes: panama, anchor: { names: ['panama'], year: null } }), [], 'etiketler de sayılır');
  const paris = lines('This is Paris on Saturday night.', 'Then Paris went quiet.');
  assert.deepEqual(P.thumbStoryErrors([{ hero: 'c1', text: 'Paris Under Curfew' }], { scenes: paris, anchor: { names: ['france', 'curfew'], year: null } }), []);
});

test('kahraman yüz hikâyenin adıyla anılan öznesi değilse reddedilir', () => {
  const anchor = { names: ['france', 'trillion', 'debt', 'trap'], year: null };
  const minister = { id: 'c1', source: 'Sébastien Lecornu at the Élysée (cropped).jpg', vision: { subject: 'face', description: 'man in a suit at a podium' } };
  const street = { id: 'c2', source: 'Paris bond market screen.jpg', vision: { subject: 'scene', description: 'trading screens' } };
  const e = P.thumbStoryErrors([{ hero: 'c1', text: 'Italy Beats France?' }, { hero: 'c2', text: 'France Pays More' }], { anchor, cands: [minister, street] });
  assert.equal(e.length, 1);
  assert.match(e[0], /^thumbnails\[0\]\.hero bir yüz/);
  const lula = { id: 'c3', source: 'Foto oficial de Luiz Inácio Lula da Silva', vision: { subject: 'face', description: 'portrait' } };
  assert.deepEqual(P.thumbStoryErrors([{ hero: 'c3', text: 'Lula Came Back' }], { anchor: { names: ['lula', 'wins', 'fourth', 'term'], year: null }, cands: [lula] }), []);
  assert.deepEqual(P.thumbStoryErrors([{ hero: 'c1', text: 'x' }], { anchor: null, cands: [minister] }), [], 'geri sayım/dizi kendi kalıbında');
});

test('paket planı bu kuralları onarıma gönderir', () => {
  const plan = { titles: ['1066: How England Was Lost in 19 Days', '1066: Harold, William and Nineteen Days', '1066: The Battle of Hastings Explained', '1066: Why Harold Lost England', '1066: Nineteen Days That Made England'].map((text) => ({ text, angle: 'x' })), thumbnails: thumbs(['Days. One Crown', 'Days', 'Lost It']) };
  const e = P.planErrors(plan, { ids: ['c1'], scenes: HASTINGS_STORY, anchor: anchorH });
  assert.ok(e.some((x) => /konuyu adlandırmıyor/.test(x)), e.join(' | '));
});
