// 1.16.16 — SHORTS KANCASI, İLK 3 SANİYE (16 Ekim 2026; kanal sahibinin getirdiği ders: Shorts'larının ve başka
// kanalların ilk 3 saniyesini tek tek inceleyen, kalanların oranı %73,8'e çıkan bir üretici). Beş kalıp (sonuç başta,
// ters köşe, garip görüntü, izleyicinin sorusu, karşılaştırma), ekran yazısı cümleyi tamamlar (≤4 kelime, ilk kareden),
// ters köşede olumsuzluk kelimesi çakılır, ilk kesim 1,2. saniyede, yeni Short önceki kalıbı tekrarlamaz.
import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../src/pipeline/growth-lessons.js');
const S = await import('../src/pipeline/docu-shorts.js');
const P = await import('../src/pipeline/docu-shorts-pictures.js');

test('beş kalıp ve ekran kuralları planlayıcıya gider; önceki Short\'ların kalıbı tekrarlanmaz', () => {
  const lines = L.shortHookLines().join('\n');
  for (const k of ['result', 'contradiction', 'strange', 'question', 'compare']) assert.ok(lines.includes(`· ${k}:`), k);
  for (const s of ['AYNI ANDA', 'İLK KARE DOLU', 'en çok 4 kelime', 'TEKRARLAMAZ, TAMAMLAR', '3-10. SANİYE', 'YASAK']) assert.ok(lines.includes(s), s);
  assert.ok(!lines.includes('önceki Short'), 'ilk Short: kalıp notu yok');
  const again = L.shortHookLines({ previousPatterns: ['question', 'question', 'bogus'] }).join('\n');
  assert.ok(again.includes('question kalıbıyla açıldı') && !again.includes('bogus'));
});

test('ekran yazısı: en çok 4 kelime, cümleyi tekrar eden yazı atılır (söz merak, yazı kanıt)', () => {
  assert.equal(L.screenText('$100,000', 'He told every one of them to take it back.'), '$100,000');
  assert.equal(L.screenText('538k followers in 7 days', 'None of these accounts are real.'), '', '5 kelime: fazla');
  assert.equal(L.screenText('538K IN 7 DAYS', 'None of these accounts are real.'), '538K IN 7 DAYS');
  assert.equal(L.screenText('HE SAID NO', 'And he said no.'), '', 'tekrar');
  assert.equal(L.screenText('a b c d e', 'x'), '', '5 kelime');
  assert.equal(L.screenText('', 'x'), '');
});

test('ters köşe: olumsuzluk kelimesi söylendiği an ekrana çakılır; bilinmeyen kalıp boş kalır', () => {
  const op = [{ say: "Delta Force operators rarely salute, and it isn't attitude.", slam: 'DELTA' }];
  const plan = L.shortOpeningPlan({ pattern: 'contradiction', screen: 'A RULE, NOT A REBELLION' }, op);
  assert.equal(op[0].slam, "ISN'T");
  assert.equal(plan.pattern, 'contradiction');
  assert.equal(plan.screen, '', '5 kelime: atılır');
  const q = [{ say: 'Why did 70 ships cross a hill?', slam: '70' }];
  assert.deepEqual(L.shortOpeningPlan({ pattern: 'question', screen: '1453' }, q), { pattern: 'question', screen: '1453' });
  assert.equal(q[0].slam, '70', 'ters köşe değilse çakılan kelime aynen');
  assert.equal(L.shortOpeningPlan({ pattern: 'weird' }, q).pattern, '');
});

test('resimli Short planı kalıbı, ekran yazısını ve önceki kalıp notunu taşır', async () => {
  let prompt = '';
  const catalog = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, kind: 'still', source: 'real', quality: 4, what: `picture ${i + 1}`, h: 1600, w: 1200, srcH: 1600, srcW: 1200 }));
  const llm = async ({ user, schema }) => {
    prompt = user;
    assert.deepEqual(schema.properties.opening.required, ['say', 'words', 'pictures', 'pattern', 'screen']);
    return { hook: 'H', opening: { say: 'In 3 days, 2,700 strangers sent Mickey Rourke $100,000, and he said no.', words: ['no'], pictures: ['p1'], pattern: 'result', screen: '$100,000' }, beats: [1, 2, 3].map((k) => ({ say: `Beat number ${k} of the story.`, picture: `p${k + 1}`, newPrompt: '', person: '', figure: '', figureWord: '' })), title: 't', description: 'd', hashtags: [], cover: [] };
  };
  const plan = await P.planPictureTeaser({ cues: [{ s: 0, e: 2, t: 'x' }], title: 'T', catalog, previous: [{ title: 'old', opening: 'o', pattern: 'question' }], llm });
  assert.ok(prompt.includes('SHORTS KANCASI') && prompt.includes('question kalıbıyla açıldı'));
  assert.equal(plan.pattern, 'result');
  assert.equal(plan.screen, '', '"$100,000" cümlede zaten söyleniyor: tekrar sayılır');
  assert.equal(plan.openingLen, 1);
});

test('ekran yazısı ilk kareden açılış sonuna kadar; ilk kesim 1,2. saniyede', () => {
  const words = [{ w: 'He', s: 0.1, e: 0.3, at: 0 }, { w: 'said', s: 0.3, e: 0.6, at: 3 }, { w: 'no.', s: 0.6, e: 1.0, at: 8 }, { w: 'Then', s: 2.6, e: 2.9, at: 12 }];
  const ass = S.buildTeaserAss({ words, hook: 'THE ROURKE STORY', slams: [{ text: 'NO', s: 0.6, e: 2.6 }], voiceEnd: 3, total: 6, screen: { text: '$100,000', s: 0, e: 2.6 } });
  assert.match(ass, /Dialogue: 2,0:00:00\.00,0:00:02\.60,Hook,.*\$100,000/);
  const segs = P.punchInSegments([
    { kind: 'still', dur: 4, srcW: 3000, srcH: 4000, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, rel: 'a.jpg' },
    { kind: 'still', dur: 4, srcW: 3000, srcH: 4000, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, rel: 'b.jpg' },
  ]);
  assert.equal(segs[0].dur, P.HOOK_CUT_AT, 'açılış resmi 1,2 sn sonra yakına kesilir');
  assert.equal(segs[2].dur, 2.2, 'sonraki resimler eskisi gibi %55');
  assert.equal(P.punchInSegments([{ kind: 'still', dur: 1.8, srcW: 3000, srcH: 4000, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, rel: 'a.jpg' }]).length, 1, 'kısa açılış resmi kesilmez');
});

test('yalnızca açılışı değiştir: aynı vuruşlar kelimesi kelimesine, yeni kalıp; eski Short kaydından okunur', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reopen-'));
  const beats = ['In 1066, England had two kings in one year.', 'Harold marched north in four days.', 'He won at Stamford Bridge.', 'Nineteen days later, William landed.', 'The full story is on the channel.'];
  // yeni kayıt: openingLen var
  fs.writeFileSync(path.join(dir, 'short-202610160101.json'), JSON.stringify({ pattern: 'question', openingLen: 1, beats: beats.map((say, i) => ({ say, ...(i === 0 ? { slam: '1066' } : {}) })) }));
  assert.deepEqual(S.reopenOf(dir, 'short-202610160101.mp4'), { beats: beats.slice(1), pattern: 'question' });
  // eski kayıt: açılış = baştaki çakılan kelimeli vuruşlar (üç parçalı açılış)
  fs.writeFileSync(path.join(dir, 'short-202610150101.json'), JSON.stringify({ beats: [{ say: 'Seventy ships.', slam: 'SHIPS' }, { say: 'One hill.', slam: 'HILL' }, { say: 'One night.', slam: 'NIGHT' }, ...beats.slice(1).map((say) => ({ say }))] }));
  assert.deepEqual(S.reopenOf(dir, 'short-202610150101'), { beats: beats.slice(1), pattern: '' });
  assert.equal(S.reopenOf(dir, '../job.json'), null, 'yalnızca short-ZAMAN adları');
  assert.equal(S.reopenOf(dir, 'short-202601010101'), null);
  // planlayıcı: istemde korunan vuruşlar ve başka kalıp; yeniden yazılmış vuruş yerine korunan söz
  let prompt = '';
  const catalog = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, kind: 'still', source: 'real', quality: 4, what: `picture ${i + 1}`, h: 1600, w: 1200 }));
  const llm = async ({ user }) => { prompt = user; return { hook: 'H', opening: { say: 'England had two kings in 1066, and both were dead by Christmas? No, only one.', words: ['No'], pictures: ['p1'], pattern: 'contradiction', screen: '19 DAYS' }, beats: beats.slice(1).map((say, k) => ({ say: say.replace('four', '4'), picture: `p${k + 2}`, newPrompt: '', person: '', figure: '', figureWord: '' })), title: 't', description: 'd', hashtags: [], cover: [] }; };
  const P2 = await import('../src/pipeline/docu-shorts-pictures.js');
  const plan = await P2.planPictureTeaser({ cues: [{ s: 0, e: 2, t: 'x' }], title: 'T', catalog, reopen: { beats: beats.slice(1), pattern: 'question' }, llm });
  assert.ok(prompt.includes('SAME STORY, NEW OPENING') && prompt.includes('another pattern than "question"') && prompt.includes('question kalıbıyla açıldı'));
  assert.deepEqual(plan.beats.slice(plan.openingLen).map((b) => b.say), beats.slice(1), 'vuruşlar kelimesi kelimesine korunur');
  assert.equal(plan.pattern, 'contradiction');
  // sunucu ve arayüz
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(server.includes('...(reopen ? { reopen } : {})'));
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('data-reopen') && app.includes('make({ reopen: x.dataset.reopen })'));
  fs.rmSync(dir, { recursive: true, force: true });
});
