// 1.16.16 — SON OKUMA (16-17 Ekim 2026, Ebola gündem videosu): render'dan önce senaryoyu elle okuyup 10 düzeltme
// yaptık; kullanıcı: "Nova bunları kendi de görebilmeli". Örnek satırlar o senaryodan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const L = await import('../src/pipeline/growth-lessons.js');
const R = await import('../src/pipeline/docu-rhetoric.js');
const S = await import('../src/pipeline/docu-script.js');
const P = await import('../src/pipeline/docu-editor-pass.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('yaklaşık + kesin sayı yuvarlanır, ekran yazısı da; kesin sayı aynen kalır', () => {
  assert.equal(L.roundAbout('In the Nizi health zone alone, about 81,124 people live in 22 displacement sites.'), 'In the Nizi health zone alone, about 81,000 people live in 22 displacement sites.');
  assert.equal(L.roundAbout('More than 9,144 cases.'), 'More than 9,100 cases.');
  assert.equal(L.roundAbout('nearly 4,410 deaths'), 'more than 4,400 deaths', '"nearly 4,500" gerçeği aşardı');
  assert.equal(L.roundAbout('nearly 9,144 cases'), 'nearly 9,200 cases');
  assert.equal(L.roundAbout('Health officials have confirmed 9,144 cases.'), 'Health officials have confirmed 9,144 cases.');
  assert.equal(L.roundAbout('about 5,000 people'), 'about 5,000 people');
  const s = { type: 'words', say: 'about 81,124 people live there', text: 'about 81,124 people', keyword: '81,124' };
  L.roundAboutScene(s);
  assert.deepEqual([s.say, s.text, s.keyword], ['about 81,000 people live there', 'about 81,000 people', '81,000']);
  assert.ok(read('../src/pipeline/docu-script.js').includes('s.say = spokenFix(s.say); roundAboutScene(s);'));
});

test('hassas konu: salgın/felakette beğeni istenmez, yorum sorusu kalır; savaş tarihi hassas sayılmaz', () => {
  assert.ok(R.sensitiveTopic("The Ebola Outbreak in Congo: Why Can't They Stop It?"));
  assert.ok(R.sensitiveTopic("Panama's 7.7 Earthquake: Why Wasn't It Worse?"));
  assert.ok(!R.sensitiveTopic('1066: The 19 Days That Changed England'));
  assert.ok(!R.sensitiveTopic('Is AI a Bubble? Microsoft and the IMF'));
  const plan = R.rhetoricPlan({ topic: 'Ebola', chapters: 8, sensitive: true });
  assert.equal(plan.cta, null);
  assert.ok(R.rhetoricLines(plan, 2, 8).join('\n').includes('HİÇBİR yerde beğeni/abone isteme'));
  assert.ok(R.rhetoricLines(plan, 7, 8).join('\n').includes('KAPANIŞ SORUSU'));
  assert.equal(R.rhetoricPlan({ topic: '1066', chapters: 8 }).ctaPlace, 'hook');
  const asks = R.likeAskLines([{ say: 'If that cup comparison made contact tracing click for you, a like helps.' }, { say: 'So is this mainly a vaccine problem, or a trust problem? Tell me which in the comments.' }]);
  assert.equal(asks.length, 1);
  const src = read('../src/pipeline/docu-script.js');
  assert.ok(src.includes('sensitive: sensitiveTopic(job.topic, job.guidance)') && src.includes('likeAskLines(scenes)'));
  assert.ok(read('../src/pipeline/docu-critic.js').includes('if (!sensitive) add(rows[0], "cta"'));
});

test('aynı alıntı en çok iki kez: açılış ve kapanış kalır, ortadaki çıkar; cihaz bağları kayar', () => {
  const Q = 'It is not known whether Ervebo may be protective against the Bundibugyo virus in humans.';
  const scenes = [
    { type: 'words', say: 'The verdict comes down to two words: not known.' },
    { type: 'quote', say: `The full sentence: ${Q}` },
    { type: 'photo', say: 'a' },
    { type: 'quote', say: `In August, the World Health Organization said: ${Q}` },
    { type: 'photo', say: 'b' },
    { type: 'split', say: 'c', left: { label: 'x', fromScene: 4 }, right: { label: 'y', fromScene: 3 } },
    { type: 'quote', say: Q },
  ];
  assert.equal(S.dropRepeatedQuotes(scenes), 1);
  assert.equal(scenes.filter((s) => s.type === 'quote').length, 2);
  assert.ok(!scenes.some((s) => String(s.say).startsWith('In August')));
  const split = scenes.find((s) => s.type === 'split');
  assert.equal(split.left.fromScene, 3, 'b sahnesi bir öne kaydı');
  assert.equal(split.right.fromScene, undefined, 'çıkan sahneye bağ silinir');
});

test('yazı kartı ≤ %15: kendi resmi olan açıklama kartları fotoğraf olur; sayı, vurgu, açılış ve kapanış kalır', () => {
  const scenes = [{ type: 'words', say: 'open', text: 'open', imagePrompt: 'p' }];
  for (let i = 0; i < 6; i++) scenes.push({ type: 'words', say: `And the count everyone quotes includes only lab cases ${'x'.repeat(i)}`, text: `the count everyone quotes ${'x'.repeat(i)}`, imagePrompt: 'p' });
  scenes.push({ type: 'words', say: 'about 81,000 people', text: 'about 81,000 people', imagePrompt: 'p' });
  scenes.push({ type: 'words', say: '[slowly, with weight] The virus is moving faster than it can be seen.', text: 'faster than it can be seen', imagePrompt: 'p' });
  scenes.push({ type: 'words', say: 'one in five contacts is lost', text: 'one in five contacts', bg: 'prev' });
  for (let i = 0; i < 16; i++) scenes.push({ type: 'photo', say: `p${i}`, imagePrompt: 'p' });
  scenes.push({ type: 'words', say: 'end', text: 'and trusting the person at the door', imagePrompt: 'p' });
  const moved = S.capTextCards(scenes);
  const left = scenes.filter((s) => s.type === 'words');
  assert.equal(moved, 6, 'altı açıklama kartının hepsi (11/27 kart, en çok 4) — korunanlar taşınmaz');
  for (const keep of ['open', 'about 81,000 people', 'faster than it can be seen', 'one in five contacts', 'and trusting the person at the door']) assert.ok(left.some((s) => s.text === keep), keep);
  assert.ok(read('../src/pipeline/docu-script.js').includes('const cards = capTextCards(scenes);'));
});

test('son okuma denetimi: Ebola düzeltmeleri geçer; uydurma sayı, yapı sahnesi, sayısız sayaç ve açılışı silme geçmez', () => {
  const scenes = [
    { type: 'words', say: "[serious] On the main vaccine against the Ebola outbreak in Congo, the World Health Organization's key words are: not known.", text: "the World Health Organization's key words are: not known", keyword: 'known' },
    { type: 'photo', say: 'Health officials have confirmed 9,144 cases in a laboratory.' },
    { type: 'counter', to: 70000, say: '[serious] Seventy thousand doses sounds like a lot, until you set it against more than five million displaced people.' },
    { type: 'photo', say: "So the response is pinning its hopes on a tool that needs nobody's trust in a budget:" },
    { type: 'photo', say: '[softly] Meanwhile, a traveller had already left Congo, crossed Uganda, and arrived in Nairobi.' },
    { type: 'photo', say: '[serious] In early October, Kenya confirmed its first case: a traveller who had come from Congo, through Uganda, to Nairobi.' },
    { type: 'map', say: 'That single journey crossed two international borders, from Congo, through Uganda, to Nairobi in Kenya.' },
    { type: 'words', say: 'In the Nizi health zone alone, about 81,124 people live in 22 displacement sites.', text: 'In the Nizi health zone alone, about 81,124 people live in 22 displacement sites', keyword: '81,124' },
    { type: 'photo', say: 'Third, whether the cases in Kenya stop at two.' },
    { type: 'photo', say: 'It starts at the door.' },
  ];
  const edits = [
    { scene: 0, action: 'rewrite', kind: 'clunky', say: "[serious] The World Health Organization's verdict on the vaccine now being used against Congo's Ebola outbreak comes down to two words: not known.", text: 'comes down to two words: not known', reason: 'a' },
    { scene: 1, action: 'rewrite', kind: 'clunky', say: 'Health officials have confirmed 12,000 cases.', reason: 'uydurma sayı' },
    { scene: 2, action: 'rewrite', kind: 'unfair-compare', say: '[serious] Seventy thousand doses are now in play, for a virus they were never designed for.', reason: 'b' },
    { scene: 3, action: 'rewrite', kind: 'logic', say: 'So the response is also pinning its hopes on a vaccine, built for a different virus.', reason: 'c' },
    { scene: 4, action: 'drop', kind: 'retold', reason: 'd' },
    { scene: 6, action: 'rewrite', kind: 'retold', say: 'That journey crossed two borders.', reason: 'harita' },
    { scene: 7, action: 'rewrite', kind: 'false-precision', say: 'In the Nizi health zone alone, more than 81,000 people live in 22 displacement sites.', reason: 'e' },
    { scene: 0, action: 'drop', kind: 'tone', reason: 'açılış' },
  ];
  const { applied, rejected } = P.applyEditorEdits(scenes, edits, { minWords: 50, lang: 'en' });
  assert.deepEqual(applied.map((e) => e.kind).sort(), ['clunky', 'false-precision', 'logic', 'retold', 'unfair-compare']);
  assert.deepEqual(rejected.map((e) => e.why), ['yeni sayı eklenemez', 'map sahnesinin satırı değişmez', 'aynı satıra ikinci düzeltme']);
  assert.equal(scenes.length, 9);
  assert.equal(scenes[0].text, 'comes down to two words: not known');
  const nizi = scenes.find((s) => String(s.say).includes('81,000'));
  assert.equal(nizi.text, 'In the Nizi health zone alone, more than 81,000 people live in 22 displacement sites.');
  assert.equal(nizi.keyword, '81,000');
  // sayaç sayısını söylemeyen satır ve kelime hedefinin altına düşüren çıkarma geçmez
  const c = [{ type: 'counter', to: 4410, say: 'And 4,410 people have died.' }, { type: 'photo', say: 'one two three four' }, { type: 'photo', say: 'x' }, { type: 'photo', say: 'y' }];
  const r2 = P.applyEditorEdits(c, [{ scene: 0, action: 'rewrite', kind: 'clunky', say: 'And many people have died.', reason: '' }, { scene: 1, action: 'drop', kind: 'retold', reason: '' }], { minWords: 9, lang: 'en' });
  assert.deepEqual(r2.rejected.map((e) => e.why), ['sayacın sayısı yeni satırda söylenmiyor', 'kelime hedefinin altına düşer']);
});

test('son okuma çağrısı: editöre Ebola örnekleri gider, düzeltmeler uygulanır ve kaydedilir; senaryo akışında bağlı', async () => {
  const brief = P.editorBrief({ lang: 'en', sensitive: true });
  for (const k of P.EDIT_KINDS) assert.ok(brief.includes(k), k);
  assert.ok(brief.includes('HASSAS KONU') && brief.includes('Araştırmada OLMAYAN hiçbir olgu, sayı'));
  const scenes = [{ type: 'words', say: 'Open line here.', text: 'Open line here.' }, { type: 'photo', say: 'about 81,124 people wait.' }, { type: 'photo', say: 'a' }, { type: 'photo', say: 'b' }];
  let logged = null;
  let asked = null;
  const llm = async (req) => { asked = req; return { edits: [{ scene: 1, action: 'rewrite', kind: 'false-precision', say: 'more than 81,000 people wait.', reason: 'yuvarla' }] }; };
  const out = await P.editorialPass({ scenes, research: 'r', job: { language: 'en' }, llm, writeLog: (o) => { logged = o; } });
  assert.equal(out.applied.length, 1);
  assert.equal(scenes[1].say, 'more than 81,000 people wait.');
  // 22 Ekim 2026: her satır tahmini süresiyle gelir ("#1 [0:02] [photo]") — editör ilk dakikayı görsün.
  assert.ok(logged && /#1 \[\d+:\d\d\] \[photo\]/.test(asked.user) && asked.schema === P.EDITOR_SCHEMA);
  const src = read('../src/pipeline/docu-script.js');
  const fin = src.indexOf('const notes = finalizeScenes(scenes');
  const pass = src.indexOf('const ed = await editorialPass({');
  const stats = src.indexOf('const repeats = crossChapterRepeats(scenes);');
  assert.ok(fin > 0 && pass > fin && stats > pass, 'son okuma son düzenlemeden sonra, uyarılardan önce');
  assert.ok(src.includes('"son-okuma.json"') && src.includes('Son okuma yapılamadı'));
});
