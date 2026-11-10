// Sanat yönetmeni: görünüm varyantı, bölüm renk yolculuğu ve sahne başına yazı stili /
// zemin / renk / efekt / geçiş / kamera. Çeşitlilik kuralları kodla uygulanır (modelin
// kuralı çiğneyen önerileri onarılır), yedek planlayıcı belirleyicidir, geçmiş dönüşümlüdür,
// döneme aykırı seçim (1400'lerde neon, 1971'de VHS) yapılmaz. Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { os.setPriority(process.pid, 10); } catch {}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-art-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = await import('../src/pipeline/docu-art-director.js');
const { validateSchema } = await import('../src/structured-output.js');
const { sceneTimes } = await import('../src/pipeline/docu-edit-director.js');

/* ---------------------------------------------------------------- senaryo */

const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'tension', 'curious', 'triumph', 'dread'];
function fixture({ id = 'art-a', genre = 'crime', era = '1971', n = 72 } = {}) {
  const scenes = Array.from({ length: n }, (_, i) => {
    const mood = MOODS[(i * 7 + Math.floor(i / 5)) % MOODS.length];
    const chapter = Math.min(3, Math.floor(i / (n / 4)));
    const say = `Scene ${i} narration about the case, line ${i}.`;
    const k = i % 9;
    if (i === 0) return { type: 'montage', mood: 'tension', say, dur: 5, text: 'Night Rain Stairs', imagePrompts: ['a', 'b', 'c'], chapter };
    if (k === 1) return { type: 'words', mood, say, dur: 5, text: `Words ${i}`, keyword: 'case', chapter, ...(i % 2 ? { bg: 'prev' } : {}) };
    if (k === 3) return { type: 'words', mood, say, dur: 5, text: `Plain words ${i}`, chapter };
    if (k === 5) return { type: 'slam', mood, say, dur: 4, word: 'GONE', chapter, ...(i % 4 === 1 ? { imagePrompt: 'dark sky' } : {}) };
    if (k === 7) return { type: 'counter', mood, say, dur: 5, to: 200000, prefix: '$', chapter };
    if (i % 17 === 0) return { type: 'photo', mood, say, dur: 6, source: 'archive', search: 'FBI teletype document 1971', imagePrompt: 'a typed FBI teletype', chapter };
    return { type: 'photo', mood, say, dur: 6, source: i % 3 ? 'ai' : 'stock', imagePrompt: `Wide shot ${i}`, ...(i % 3 ? {} : { search: `jet night ${i}`, media: i % 2 ? 'video' : undefined }), chapter };
  });
  scenes.splice(20, 0, { type: 'title', mood: 'calm', say: 'Title card narration.', dur: 4, title: 'The Case', chapter: 1 });
  return { id, seedKey: id, title: 'Test case', genre, era, locale: 'en-US', chapters: ['One', 'Two', 'Three', 'Four'], scenes };
}
const tmp = (name) => path.join(home, `${name}-${Math.random().toString(36).slice(2)}.json`);
const noLog = () => {};
const run = (script, o = {}) => A.artDirect(script, { llm: false, historyFile: o.historyFile || tmp('hist'), logFn: noLog, ...o });

/* ---------------------------------------------------------------- testler */

test('yedek planlayıcı: bütün kurallar sağlanır, anlatım/sıra/süre/cihaz/kaynak/bg değişmez', async () => {
  const s = fixture();
  const res = await run(s);
  assert.equal(res.mode, 'fallback');
  assert.deepEqual(res.violations, []);
  assert.equal(res.script.scenes.length, s.scenes.length);
  const ART = ['textStyle', 'backdrop', 'grade', 'fx', 'transition', 'camera', 'fit', 'energy', 'pace', 'counterStyle', 'textMode', 'kicker'];
  res.script.scenes.forEach((x, i) => {
    const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !ART.includes(k)));
    assert.deepEqual(strip(x), strip(s.scenes[i]), `sahne ${i} yalnızca görünüm alanları kazanmalı`);
  });
  // girdi değişmedi
  assert.ok(!s.scenes.some((x) => x.textStyle || x.camera));
  // sözleşme alanları
  assert.ok(res.script.look?.variant);
  assert.equal(res.script.chapterLooks.length, 4);
  for (const c of res.script.chapterLooks) {
    assert.match(c.accent, /^#[0-9a-f]{6}$/);
    assert.ok(A.GRADES.includes(c.grade));
    assert.ok(A.BACKDROP_KINDS.includes(c.backdrop.kind));
  }
  const text = res.script.scenes.filter(A.isTextScene);
  const styles = new Set(text.map((x) => x.textStyle).filter((st) => !A.ACCENT_TEXT.has(st)));
  assert.ok(styles.size >= 4 && styles.size <= 6, `4-6 düzenli yazı stili (${styles.size})`);
  // bg:'prev' yazı sahnesi zemin almaz; resimsiz yazı sahnesi alır
  assert.ok(res.script.scenes.every((x) => !(x.bg === 'prev' && x.backdrop)));
  assert.ok(res.script.scenes.filter((x) => x.backdrop).length >= 3);
  // belge taraması contain + sakin kamera
  const doc = res.script.scenes.find((x) => /teletype/.test(x.search || ''));
  assert.equal(doc.fit, 'contain');
  // hepsi koyu değil
  assert.ok(res.script.scenes.filter((x) => A.isLightBackdrop(x.backdrop)).length >= 3);
});

test('yedek planlayıcı belirleyicidir; farklı video farklı görünür', async () => {
  const hist = tmp('hist');
  const a = await run(fixture({ id: 'x1' }), { historyFile: hist, recordHistory: false });
  const b = await run(fixture({ id: 'x1' }), { historyFile: hist, recordHistory: false });
  assert.deepEqual(a.plan, b.plan);
  const plans = [];
  for (const id of ['v1', 'v2', 'v3', 'v4', 'v5']) plans.push((await run(fixture({ id }), { historyFile: tmp('h'), recordHistory: false })).plan);
  const sig = (p) => JSON.stringify(p.scenes.map((e) => [e.textStyle, e.transition, e.camera]));
  assert.ok(new Set(plans.map(sig)).size >= 4, 'farklı tohum farklı sahne kararları');
  assert.ok(new Set(plans.map((p) => p.look.variant)).size >= 2, 'farklı tohum farklı varyant');
});

test('geçmiş dönüşümü: varyant türün son 3 videosundan farklı; önbellek geçmişe yeniden yazmaz', async () => {
  const hist = tmp('hist');
  const seen = [];
  for (let k = 0; k < 7; k++) {
    const res = await run(fixture({ id: `rot-${k}` }), { historyFile: hist });
    const v = res.plan.look.variant;
    assert.ok(!seen.slice(-3).includes(v), `video ${k}: ${v} son 3 videoda (${seen.slice(-3)}) kullanılmış`);
    seen.push(v);
    assert.deepEqual(res.violations, []);
  }
  const h = A.readHistory(hist);
  assert.equal(h.length, 7);
  assert.ok(h.every((e) => e.genre === 'crime' && e.variant && e.textStyles.length >= 4 && e.transitions.length >= 1 && Array.isArray(e.cameras) && e.at));
  // başka tür, kendi geçmişi
  const epic = await run(fixture({ id: 'ep-1', genre: 'epic', era: '1453' }), { historyFile: hist });
  assert.ok(A.loadCatalogs().looks.find((l) => l.id === epic.plan.look.variant).genres.includes('epic'));
  // aynı video yeniden planlanınca kendisiyle çakışmaz, çift kayıt olmaz; önbellekten gelen plan geçmişe yazmaz
  const cache = tmp('cache');
  const s = fixture({ id: 'rot-6' });
  const r1 = await run(s, { historyFile: hist, cacheFile: cache });
  const before = A.readHistory(hist).length;
  const r2 = await run(s, { historyFile: hist, cacheFile: cache });
  assert.equal(r2.cached, true);
  assert.deepEqual(r2.plan, r1.plan);
  assert.equal(A.readHistory(hist).length, before);
  assert.equal(A.readHistory(hist).filter((e) => e.id === 'rot-6').length, 1);
});

test('dönem kuralları: 1453 destanında neon/glitch/vhs/kodachrome yok; 1971 suçunda vhs yok; 1986 bilimde vhs var', async () => {
  assert.equal(A.eraAllows('grade', 'vhs', '1971'), false);
  assert.equal(A.eraAllows('grade', 'vhs', '1977-1990'), true);
  assert.equal(A.eraAllows('grade', 'kodachrome', '1971'), true);
  assert.equal(A.eraAllows('grade', 'kodachrome', '1453'), false);
  assert.equal(A.eraAllows('grade', 'sepia', '1912 (Titanic; wreck scenes after 1985)'), true);
  assert.equal(A.eraAllows('grade', 'vhs', '1912 (Titanic; wreck scenes after 1985)'), false, 'enkaz 1985 bir 80ler hikâyesi yapmaz');
  assert.equal(A.eraAllows('grade', 'sepia', '1971'), false);
  assert.equal(A.eraAllows('textStyle', 'neon', '1453'), false);
  assert.equal(A.eraAllows('transition', 'glitch', '1453'), false);
  assert.equal(A.eraAllows('fx', 'chroma', '1880-1943'), false);
  assert.equal(A.eraAllows('transition', 'glitch', '1929-1933 (Great Depression)', 'finance'), false, 'Buhranda dijital geçiş yok');
  assert.equal(A.eraAllows('textStyle', 'neon', '1986'), true);
  const banned = new Set(['neon', 'glitch', 'vhs', 'kodachrome', 'pixel', 'scan-lines', 'chroma']);
  for (const id of ['e1', 'e2', 'e3', 'e4']) {
    const res = await run(fixture({ id, genre: 'epic', era: '1453 (Byzantium and the Ottomans)' }));
    assert.deepEqual(res.violations, []);
    const used = res.script.scenes.flatMap((x) => [x.textStyle, x.grade, x.transition, ...(x.fx || [])]).concat(res.script.chapterLooks.map((c) => c.grade));
    assert.deepEqual(used.filter((u) => banned.has(u)), [], `1453: ${id}`);
  }
  for (const id of ['c1', 'c2', 'c3']) {
    const res = await run(fixture({ id, era: '1971 (the night of the hijacking)' }));
    const used = res.script.scenes.flatMap((x) => [x.grade, ...(x.fx || [])]);
    assert.ok(!used.includes('vhs'));
  }
});

test('model önerisi kurallara göre onarılır; geçerli öneriler korunur', async () => {
  const s = fixture({ id: 'llm-1' });
  const text = s.scenes.map((x, i) => (A.isTextScene(x) ? i : -1)).filter((i) => i >= 0);
  const calm = s.scenes.findIndex((x, i) => i > 0 && x.mood === 'calm' && x.type === 'photo');
  // vurucu olmayan, kanca olmayan (ilk 40 sn sonrası) bir words sahnesi: önerilen typewriter korunmalı
  const plainText = text.find((i) => i > 12 && s.scenes[i].type === 'words' && s.scenes[i - 1].type !== 'words');
  const pics = s.scenes.map((x, i) => (A.isGradeScene(x) ? i : -1)).filter((i) => i >= 0);
  let calls = 0;
  let seenSchema = null;
  const llm = async ({ schema, model, system, user }) => {
    calls++;
    seenSchema = schema;
    assert.equal(model, 'claude-opus-5-5');
    assert.match(system, /ART DIRECTOR/);
    assert.match(user, /#0 /);
    const scenes = s.scenes.map((x, i) => ({ scene: i, transition: i % 2 ? 'whip' : 'cut' }));
    for (const i of text) scenes[i].textStyle = 'box'; // hepsi aynı stil → onarılmalı
    scenes[calm].fx = ['glitch', 'shake']; // sakin sahnede sert efekt → atılmalı
    scenes[plainText].textStyle = 'typewriter';
    for (const i of pics) { scenes[i].grade = ['warm', 'cool', 'mono', 'bleach'][i % 4]; scenes[i].camera = 'push-in'; }
    scenes[3].grade = 'vhs'; // 1971'de vhs yok
    return {
      variant: 'red-thread', textStyles: ['box', 'typewriter', 'serif', 'underline', 'marker'], transitions: ['whip', 'leak', 'slide', 'iris', 'flash'], accents: ['ink'],
      chapterLooks: [1, 2, 3, 4].map((c) => ({ chapter: c, accent: c === 4 ? '#e63946' : 'not-a-colour', grade: 'cool', backdrop: { kind: 'paper', color: '#f0e8d8' } })),
      scenes,
    };
  };
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), cacheFile: tmp('cache'), logFn: noLog });
  assert.equal(calls, 1);
  assert.equal(res.mode, 'llm');
  assert.deepEqual(res.violations, []);
  assert.equal(res.plan.look.variant, 'red-thread');
  assert.equal(res.script.scenes[plainText].textStyle, 'typewriter', 'geçerli öneri korunur');
  assert.equal(res.script.chapterLooks[3].accent, '#e63946', 'geçerli bölüm rengi korunur');
  assert.match(res.script.chapterLooks[0].accent, /^#[0-9a-f]{6}$/, 'geçersiz renk onarılır');
  assert.ok(!(res.script.scenes[calm].fx || []).some((k) => ['glitch', 'shake'].includes(k)));
  assert.notEqual(res.script.scenes[3].grade, 'vhs');
  // şema gerçekten geçerli bir cevabı kabul eder (strict yapılandırılmış çıktı)
  assert.deepEqual(validateSchema({ variant: 'red-thread', textStyles: ['box'], transitions: ['whip'], accents: [], chapterLooks: [{ chapter: 1, accent: '#112233', grade: 'cool', backdrop: { kind: 'paper' } }], scenes: [{ scene: 1, camera: 'drift', fit: 'smart', fx: ['dust'] }] }, seenSchema), []);
  assert.notDeepEqual(validateSchema({ variant: 'red-thread', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [{ scene: 1, camera: 'crane' }] }, seenSchema), []);
  assert.ok(!seenSchema.properties.scenes.items.properties.grade.enum.includes('vhs'), 'şema döneme göre süzülür');
});

test('model son videolarda kullanılan varyantı seçerse reddedilir', async () => {
  const hist = tmp('hist');
  A.recordHistory(hist, { id: 'old-1', genre: 'crime', variant: 'red-thread', textStyles: [], transitions: [], at: '2026-01-01' });
  let variants = null;
  const llm = async ({ schema }) => { variants = schema.properties.variant.enum; return { variant: 'red-thread', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] }; };
  const res = await A.artDirect(fixture({ id: 'new-1' }), { llm, historyFile: hist, logFn: noLog });
  assert.ok(!variants.includes('red-thread'), 'şema son kullanılanı sunmaz');
  assert.notEqual(res.plan.look.variant, 'red-thread');
  assert.deepEqual(res.violations, []);
});

test('kredi yoksa yedek planlayıcı; önbellek aynı senaryo için modeli yeniden çağırmaz', async () => {
  const s = fixture({ id: 'nc-1' });
  const logs = [];
  const res = await A.artDirect(s, { llm: async () => { throw new Error('400 Your credit balance is too low to access the Anthropic API'); }, historyFile: tmp('hist'), logFn: (m) => logs.push(m) });
  assert.equal(res.mode, 'fallback');
  assert.equal(res.skipped, 'no-credit');
  assert.deepEqual(res.violations, []);
  assert.ok(logs.some((l) => /kredisi yok/.test(l)));
  // anahtar yokken (gerçek callJSON) ağ çağrısı yapılmaz
  const r0 = await A.artDirect(s, { settings: {}, historyFile: tmp('hist'), logFn: noLog });
  assert.equal(r0.skipped, 'no-key');
  // önbellek
  const cache = tmp('cache');
  let calls = 0;
  const llm = async () => { calls++; return { variant: 'tabloid', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] }; };
  const a = await A.artDirect(s, { llm, cacheFile: cache, historyFile: tmp('hist'), logFn: noLog });
  const b = await A.artDirect(s, { llm, cacheFile: cache, historyFile: tmp('hist'), logFn: noLog });
  assert.equal(calls, 1);
  assert.equal(b.cached, true);
  assert.deepEqual(a.plan, b.plan);
  // iptal yayılır
  await assert.rejects(A.artDirect(fixture({ id: 'cx' }), { llm: async () => { throw new Error('cancelled'); }, historyFile: tmp('hist'), logFn: noLog }), /cancelled/);
});

test('arşivden sonra uygulama: geniş resim kaydırılır, dikey resim sığdırılır, plan eşleşmezse atlanır', async () => {
  const s = fixture({ id: 'asp-1' });
  const res = await run(s);
  const pics = res.script.scenes.map((x, i) => (A.isGradeScene(x) ? i : -1)).filter((i) => i >= 0);
  // arşiv adımı oranları doldurdu
  const archived = { ...s, scenes: s.scenes.map((x, i) => (pics.includes(i) ? { ...x, imgW: i % 2 ? 3000 : 800, imgH: 1000, archived: true } : x)) };
  const out = A.applyArtPlan(archived, res.plan);
  for (const i of pics) {
    const x = out.scenes[i];
    if (x.imgW / x.imgH > 1.9) assert.ok(['pan-left', 'pan-right', 'static', 'drift'].includes(x.camera), `geniş #${i}: ${x.camera}`);
    else assert.ok(['tilt-up', 'tilt-down', 'static', 'drift'].includes(x.camera) || x.fit === 'contain', `dikey #${i}`);
  }
  assert.deepEqual(A.checkPlan(out), []);
  // bg alanına dokunulmaz
  out.scenes.forEach((x, i) => assert.equal(x.bg, archived.scenes[i].bg));
  // anlatımı değişmiş sahneye karar uygulanmaz
  const changed = { ...s, scenes: s.scenes.map((x, i) => (i === 5 ? { ...x, say: 'Completely different line.' } : x)) };
  const out2 = A.applyArtPlan(changed, res.plan);
  for (const k of ['textStyle', 'camera', 'grade', 'fx', 'backdrop', 'energy', 'pace']) assert.equal(out2.scenes[5][k], undefined);
});

test('checkPlan kural ihlallerini yakalar', () => {
  const s = fixture({ id: 'chk' });
  const text = s.scenes.map((x, i) => (A.isTextScene(x) ? i : -1)).filter((i) => i >= 0);
  const bad = { ...s, scenes: s.scenes.map((x, i) => ({ ...x, ...(text.includes(i) ? { textStyle: 'box' } : {}), transition: i ? 'whip' : 'cut', ...(A.isGradeScene(x) ? { camera: 'handheld', grade: ['warm', 'cool', 'mono'][i % 3] } : {}), fx: i % 2 ? ['glitch'] : undefined })) };
  const v = A.checkPlan(bad).join('\n');
  assert.match(v, /ardışık yazı sahnesi aynı stil/);
  assert.match(v, /yazı stili sayısı/);
  assert.match(v, /aynı geçiş art arda/);
  assert.match(v, /efektli sahne/);
  assert.match(v, /sert efekt/);
  assert.match(v, /farklı grade/);
  assert.match(v, /handheld yalnızca gerilim/);
  assert.match(v, /durağan kamera payı/);
  assert.match(v, /3 ardışık resimli sahnede/);
});

test('gerçek senaryolar (long-en): yedek plan temiz, türler farklı görünür', async () => {
  const dir = path.join(ROOT, 'docu-engine/videos/long-en');
  const hist = tmp('hist');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const script = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const res = await run(script, { historyFile: hist });
    assert.deepEqual(res.violations, [], f);
    assert.equal(res.script.scenes.length, script.scenes.length);
    res.script.scenes.forEach((x, i) => { assert.equal(x.say, script.scenes[i].say); assert.equal(x.type, script.scenes[i].type); assert.equal(x.bg, script.scenes[i].bg); });
  }
});

test('docu.js sanat yönetmenini kurgu yönetmeninden sonra bağlar (kapatılabilir)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/pipeline/docu.js'), 'utf8');
  assert.match(src, /import \{ artDirect, applyArtPlan \} from "\.\/docu-art-director\.js"/);
  assert.match(src, /settings\.docuArtDirector !== false/);
  const edit = src.indexOf('await directEdit(');
  const art = src.indexOf('await artDirect(');
  const archive = src.indexOf('await resolveArchive(');
  assert.ok(edit > 0 && art > edit && archive > art, 'sıra: kurgu → sanat → arşiv');
  assert.ok(src.indexOf('applyArtPlan(ed, artPlan') > archive, 'plan arşivden sonra uygulanır');
  assert.match(src, /docu-art-director\.json/);
});

/* ---------------------------------------------------------------- tempo (enerji dalgası) */

const lowFx = (x) => x.energy <= 2 && (x.fx || []).length;
test('tempo: her sahnede enerji + pace; zirveden sonra nefes, en çok 3 ardışık zirve, ~%40/%35/%25', async () => {
  for (const id of ['p1', 'p2', 'p3', 'p4']) {
    const res = await run(fixture({ id, n: 90 }));
    assert.deepEqual(res.violations, [], id);
    const S = res.script.scenes;
    assert.ok(S.every((x) => Number.isInteger(x.energy) && x.energy >= 1 && x.energy <= 5 && x.pace === A.paceOf(x.energy)));
    let hiRun = 0;
    S.forEach((x, i) => {
      hiRun = x.energy >= 4 ? hiRun + 1 : 0;
      assert.ok(hiRun <= 3, `${id} #${i}: ${hiRun} ardışık zirve`);
      if (x.energy >= 4) assert.ok(A.peakEligible(x), `${id} #${i}: zirve uygun anda değil`);
      if (i && S[i - 1].energy >= 4 && x.energy < 4) {
        assert.equal(x.energy, 1, `${id} #${i}: zirveden sonra nefes`);
        assert.equal(x.transition, 'cut');
        assert.ok(!(x.fx || []).length);
        if (x.camera) assert.equal(x.camera, 'static');
      }
    });
    const share = (f) => S.filter(f).length / S.length;
    assert.ok(Math.abs(share((x) => x.energy <= 2) - 0.4) <= 0.1, 'düşük ~%40');
    assert.ok(Math.abs(share((x) => x.energy === 3) - 0.35) <= 0.1, 'orta ~%35');
    assert.ok(Math.abs(share((x) => x.energy >= 4) - 0.25) <= 0.08, 'yüksek ~%25');
    // her bölümde zirve ve iki sahnelik soluklanma
    for (let c = 0; c < 4; c++) {
      const ci = S.map((x, i) => (x.chapter === c ? i : -1)).filter((i) => i >= 0);
      assert.ok(ci.some((i) => S[i].energy >= 4), `${id} bölüm ${c + 1} zirvesiz`);
      assert.ok(ci.some((i, k) => k && S[i].energy <= 2 && S[ci[k - 1]].energy <= 2), `${id} bölüm ${c + 1} soluklanmasız`);
    }
    // enerji diğer seçimleri sürer
    assert.ok(!S.some(lowFx), 'düşük enerjide efekt yok');
    assert.ok(S.every((x) => x.energy >= 3 || !x.transition || x.transition === 'cut'), 'düşük enerji düz kesmeyle girer');
    assert.ok(S.every((x) => !(x.fx || []).some((k) => ['glitch', 'shake', 'chroma', 'film-burn'].includes(k)) || x.energy === 5), 'sert efekt yalnızca 5');
    assert.ok(S.every((x) => x.energy !== 1 || !x.camera || ['static', 'drift'].includes(x.camera)), 'enerji 1 durağan');
    assert.ok(S.every((x) => x.energy < 4 || !x.camera || !['static', 'drift'].includes(x.camera)), 'zirvede kamera durmaz');
    assert.ok(S.every((x) => !['handheld', 'detail-punch'].includes(x.camera) || x.energy >= 4), 'omuz/detay yalnızca zirvede');
  }
});

test('tempo: modelin enerji önerisi sıralamayı belirler ama kurallar onarılır', async () => {
  const s = fixture({ id: 'pe-1' });
  const reveal = s.scenes.findIndex((x, i) => i > 10 && x.mood === 'reveal' && x.type === 'photo');
  const llm = async ({ schema }) => {
    assert.deepEqual(schema.properties.scenes.items.properties.energy.enum, [1, 2, 3, 4, 5]);
    // her sahne 5: dalga yok, nefes yok, sakin sahneler zirvede → onarılmalı
    const scenes = s.scenes.map((x, i) => ({ scene: i, energy: 5, transition: 'cut' }));
    scenes[reveal].energy = 5;
    return { variant: 'tabloid', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes };
  };
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(res.violations, []);
  const S = res.script.scenes;
  assert.ok(S.filter((x) => x.energy >= 4).length / S.length <= 0.32);
  assert.ok(S.every((x) => x.energy < 4 || A.peakEligible(x)));
  // tutarlı bir dalga önerisi büyük ölçüde korunur
  const wave = (res2) => res2.script.scenes.map((x) => x.energy);
  const fb = await run(fixture({ id: 'pe-1' }), { recordHistory: false });
  const good = fb.script.scenes.map((x, i) => ({ scene: i, energy: x.energy, transition: 'cut' }));
  const res2 = await A.artDirect(s, { llm: async () => ({ variant: 'tabloid', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: good }), historyFile: tmp('hist'), logFn: noLog });
  const same = wave(res2).filter((e, i) => e === fb.script.scenes[i].energy).length;
  assert.ok(same / S.length >= 0.8, `geçerli dalga korunmalı (${same}/${S.length})`);
  assert.deepEqual(res2.violations, []);
});

test('checkPlan tempo ihlallerini yakalar', async () => {
  const res = await run(fixture({ id: 'pchk' }));
  const S = res.script.scenes.map((x) => ({ ...x }));
  const peaks = S.map((x, i) => (A.peakEligible(x) ? i : -1)).filter((i) => i >= 0);
  const calm = S.findIndex((x, i) => i > 40 && x.mood === 'calm');
  S[calm] = { ...S[calm], energy: 5, pace: 'rapid' };
  const p = peaks.find((i) => i > 40 && i !== calm - 1 && i + 1 !== calm && S[i + 1] && S[i + 1].energy !== 1 && S[i + 1].energy < 4 && S[i].energy < 4);
  S[p] = { ...S[p], energy: 4, pace: 'quick' };
  S[3] = { ...S[3], pace: 'rapid', energy: 1 };
  for (let i = 30; i < 35; i++) S[i] = { ...S[i], energy: 4, pace: 'quick', mood: 'tension' };
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /zirve \(5\) gerilim\/ifşa\/slam\/montaj anında değil/);
  assert.match(v, /zirveden sonra nefes yok/);
  assert.match(v, /pace rapid enerji 1 ile uyuşmuyor/);
  assert.match(v, /ardışık yüksek enerjili sahne/);
});
/* ---------------------------------------------------------------- katalog ve vurgu yazıları */

const readCat = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'docu-engine', f), 'utf8'));
const sorted = (a) => [...a].sort();

test('katalog: gerçek varyant kimlikleri okunur; efekt/geçiş/kamera/fit/stil kimlikleri sözleşmeyle aynı', async () => {
  const cats = A.loadCatalogs();
  assert.equal(cats.source, 'catalog');
  const L = readCat('looks-catalog.json');
  const F = readCat('effects-catalog.json');
  for (const [g, vs] of Object.entries(L.variants)) {
    assert.deepEqual(cats.looks.filter((l) => l.genres.includes(g)).map((l) => l.id), vs.map((v) => v.id), g);
  }
  assert.equal(cats.looks.length, Object.values(L.variants).flat().length);
  assert.deepEqual(sorted(F.scene.fx.map((x) => x.id)), sorted(A.FX_KINDS));
  assert.deepEqual(sorted(F.transitions.map((x) => x.id)), sorted(A.TRANSITIONS));
  assert.deepEqual(sorted(F.scene.camera.map((x) => (typeof x === 'string' ? x : x.id))), sorted(A.CAMERAS));
  assert.deepEqual(sorted(F.scene.fit.map((x) => (typeof x === 'string' ? x : x.id))), sorted(A.FITS));
  assert.deepEqual(F.scene.energy.values, [1, 2, 3, 4, 5]);
  assert.deepEqual(sorted(F.scene.pace.values), sorted(A.PACES));
  assert.deepEqual(sorted(F.transitions.filter((x) => x.heavy).map((x) => x.id)), sorted(A.HEAVY_TRANSITIONS));
  assert.deepEqual(sorted(F.transitions.filter((x) => x.needsPictures).map((x) => x.id)), sorted(A.NEEDS_PICTURES));
  assert.deepEqual(sorted(L.textStyles.map((x) => x.id)), sorted(A.TEXT_STYLES));
  assert.deepEqual(sorted(L.textStyles.filter((x) => x.accent).map((x) => x.id)), sorted(A.ACCENT_TEXT));
  assert.ok(L.textStyles.filter((x) => x.accent).every((x) => x.maxPerVideo >= 3));
  assert.deepEqual(sorted(L.grades.map((x) => x.id)), sorted(A.GRADES));
  assert.deepEqual(sorted(L.backdrops.map((x) => x.id)), sorted(A.BACKDROP_KINDS));
  // her tür: kataloğun kendi türündeki, özgün olmayan bir varyantı; türe uymayan stil/efekt/geçiş yok
  const dir = path.join(ROOT, 'docu-engine/videos/long-en');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const script = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const res = await run(script, { catalogs: cats });
    const look = cats.looks.find((l) => l.id === res.plan.look.variant);
    assert.ok(look && look.genres.includes(script.genre) && !look.original, `${f}: ${res.plan.look.variant}`);
    assert.deepEqual(res.violations, [], f);
    const fits = (list, id) => { const o = list.find((x) => x.id === id); return o && (o.genres === 'all' || o.genres.includes(script.genre)); };
    for (const s of res.script.scenes) {
      if (s.textStyle) assert.ok(fits(L.textStyles, s.textStyle), `${f}: ${s.textStyle}`);
      if (s.transition) assert.ok(fits(F.transitions, s.transition), `${f}: ${s.transition}`);
      for (const k of s.fx || []) assert.ok(fits(F.scene.fx, k), `${f}: ${k}`);
      if (s.grade) assert.ok(fits(L.grades, s.grade), `${f}: ${s.grade}`);
    }
    assert.ok(Array.isArray(res.script.transitionPalette) && res.script.fxDensity <= 0.35);
  }
});

test('vurgu yazıları (lyric/kinetic): videoda en çok 3, yalnızca kanca/alıntı/zirve, ardışık değil, sakin/hüzünlüde değil', async () => {
  const seen = new Set();
  let withAccent = 0;
  for (let k = 0; k < 10; k++) {
    const s = fixture({ id: `acc-${k}` });
    s.scenes[40] = { ...s.scenes[40], type: 'words', mood: 'tension', text: 'I have a bomb', say: 'He handed her a note: "Miss, I have a bomb in my briefcase."' };
    const res = await run(s);
    const { starts } = sceneTimes(s);
    assert.deepEqual(res.violations, [], `acc-${k}`);
    const text = res.script.scenes.map((x, i) => ({ x, i })).filter(({ x }) => A.isTextScene(x));
    const acc = text.filter(({ x }) => A.ACCENT_TEXT.has(x.textStyle));
    assert.ok(acc.length <= 3);
    if (acc.length) withAccent++;
    for (const { x, i } of acc) {
      seen.add(x.textStyle);
      assert.ok(!A.GENTLE_MOODS.has(x.mood));
      assert.ok(A.isQuoteLike(x) || x.energy >= 4 || starts[i] < 40, `#${i} kanca/alıntı/zirve değil`);
    }
    text.forEach(({ x }, j) => { if (j && A.ACCENT_TEXT.has(x.textStyle)) assert.ok(!A.ACCENT_TEXT.has(text[j - 1].x.textStyle), 'ardışık vurgu'); });
    // vurgular 4-6'lık palete sayılmaz
    const regular = new Set(text.map(({ x }) => x.textStyle).filter((st) => !A.ACCENT_TEXT.has(st)));
    assert.ok(regular.size >= 4 && regular.size <= 6);
    assert.ok(res.plan.palette.textStyles.every((st) => !A.ACCENT_TEXT.has(st)));
  }
  assert.ok(withAccent >= 8, 'videoların çoğunda en az bir vurgu yazısı');
  assert.deepEqual(sorted(seen), ['kinetic', 'lyric'], 'iki vurgu stili de kullanılır');
});

test('vurgu yazıları: model önerisi tavana, uygunluğa ve ardışıklığa göre onarılır', async () => {
  const s = fixture({ id: 'acc-llm' });
  const text = s.scenes.map((x, i) => (A.isTextScene(x) ? i : -1)).filter((i) => i >= 0);
  const calmText = text.find((i) => A.GENTLE_MOODS.has(s.scenes[i].mood));
  const llm = async ({ schema }) => {
    assert.ok(schema.properties.scenes.items.properties.textStyle.enum.includes('lyric'));
    const scenes = s.scenes.map((x, i) => ({ scene: i, transition: 'cut' }));
    for (const i of text) scenes[i].textStyle = 'kinetic'; // her yazı sahnesi vurgu → en çok 3, ardışık değil
    scenes[calmText].textStyle = 'lyric';
    return { variant: 'color-noir', textStyles: ['lower-third', 'outline', 'underline', 'box'], transitions: [], accents: [], chapterLooks: [], scenes };
  };
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(res.violations, []);
  const acc = res.script.scenes.filter((x) => A.ACCENT_TEXT.has(x.textStyle));
  assert.ok(acc.length >= 1 && acc.length <= 3, `${acc.length}`);
  assert.notEqual(res.script.scenes[calmText].textStyle, 'lyric');
  // checkPlan: dördüncü vurgu ve sakin sahnede vurgu yakalanır
  const S = res.script.scenes.map((x) => ({ ...x }));
  let added = 0;
  for (let k = 2; k < text.length && added < 3; k += 3) { const i = text[k]; if (!A.ACCENT_TEXT.has(S[i].textStyle) && !A.ACCENT_TEXT.has(S[text[k - 1]].textStyle) && !A.ACCENT_TEXT.has(S[text[k + 1]]?.textStyle)) { S[i].textStyle = 'lyric'; added++; } }
  S[calmText].textStyle = 'kinetic';
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /vurgu yazısı \(lyric\/kinetic\) \d+ > 3/);
  assert.match(v, /vurgu yazısı kinetic kanca\/alıntı\/zirve dışında/);
});
/* ------------------------------------------------------------- sayaçlar */

const counterIdx = (s) => s.scenes.map((x, i) => (x.type === 'counter' ? i : -1)).filter((i) => i >= 0);

test('sayaç çizimleri: ardışık iki sayaç aynı değil, en az 3 çeşit, photo yalnızca önünde resim varsa, döneme uygun', async () => {
  const cats = A.loadCatalogs();
  for (const [id, genre, era] of [['cnt-a', 'crime', '1971'], ['cnt-b', 'finance', '1929-1933'], ['cnt-c', 'epic', '1453'], ['cnt-d', 'documentary', '1912']]) {
    const s = fixture({ id, genre, era });
    // bir sayacın önünü resimsiz yap: photo oraya konmamalı
    const cs = counterIdx(s);
    s.scenes[cs[2] - 1] = { ...s.scenes[cs[2] - 1], type: 'words', text: 'four plain words here', imagePrompt: undefined, search: undefined, source: undefined, media: undefined };
    s.scenes[cs[2] - 2] = { ...s.scenes[cs[2] - 2], type: 'words', text: 'five plain words right here', imagePrompt: undefined, search: undefined, source: undefined, media: undefined };
    const res = await run(s, { catalogs: cats });
    assert.deepEqual(res.violations, [], id);
    const st = counterIdx(res.script).map((i) => res.script.scenes[i].counterStyle);
    assert.ok(st.every(Boolean), `${id}: her sayacın çizimi var`);
    st.forEach((x, k) => k && assert.notEqual(x, st[k - 1], `${id}: ardışık sayaç ${k}`));
    assert.ok(new Set(st).size >= 3, `${id}: ${st.join(',')}`);
    assert.notEqual(res.script.scenes[cs[2]].counterStyle, 'photo', `${id}: resimsiz sayaç photo olmaz`);
    if (era === '1453') assert.ok(!st.some((x) => ['ticker', 'odometer', 'newsprint'].includes(x)), `1453: ${st.join(',')}`);
    if (genre !== 'finance') assert.ok(!st.includes('ticker'), `${id}: borsa şeridi yalnızca finans`);
  }
  // belirleyici: aynı senaryo aynı çizimler
  const a = await run(fixture({ id: 'cnt-det', genre: 'finance', era: '1929' }), { catalogs: cats });
  const b = await run(fixture({ id: 'cnt-det', genre: 'finance', era: '1929' }), { catalogs: cats });
  assert.deepEqual(counterIdx(a.script).map((i) => a.script.scenes[i].counterStyle), counterIdx(b.script).map((i) => b.script.scenes[i].counterStyle));
});

test('sayaç çizimleri: model önerisi onarılır (art arda aynı / iki çizim dönüşümlü / resimsiz photo / döneme aykırı)', async () => {
  const s = fixture({ id: 'cnt-llm', genre: 'finance', era: '1929-1933' });
  const cs = counterIdx(s);
  let seen = null;
  const llm = async ({ schema, user }) => {
    seen = schema;
    assert.match(user, /\{[A-Z]*C\+?\}/, 'sayaç sahneleri işaretli');
    const scenes = s.scenes.map((x, i) => ({ scene: i, transition: 'cut' }));
    cs.forEach((i, k) => { scenes[i].counterStyle = k % 2 ? 'bare' : 'box'; }); // A B A B: çeşit az
    scenes[cs[1]].counterStyle = 'box'; // art arda box
    return { variant: 'salmon-paper', textStyles: ['serif', 'underline', 'lower-third', 'stack'], transitions: [], accents: [], chapterLooks: [], scenes };
  };
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(res.violations, []);
  assert.ok(seen.properties.scenes.items.properties.counterStyle.enum.includes('ticker'), '1929 finans: borsa şeridi var');
  const st = cs.map((i) => res.script.scenes[i].counterStyle);
  st.forEach((x, k) => k && assert.notEqual(x, st[k - 1]));
  assert.ok(new Set(st).size >= 3, st.join(','));
  assert.equal(res.script.scenes[cs[0]].counterStyle, 'box', 'geçerli öneri korunur');
  // 1453: şema mekanik sayaç / borsa şeridi / gazete sunmaz
  const old = fixture({ id: 'cnt-1453', genre: 'epic', era: '1453' });
  let oldSchema = null;
  await A.artDirect(old, { llm: async ({ schema }) => { oldSchema = schema; return { variant: 'x', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] }; }, historyFile: tmp('hist'), logFn: noLog });
  const en = oldSchema.properties.scenes.items.properties.counterStyle.enum;
  assert.ok(!en.includes('ticker') && !en.includes('odometer') && !en.includes('newsprint') && en.includes('outline'), en.join(','));
});

test('checkPlan sayaç ve lower-third ihlallerini yakalar', async () => {
  const s = fixture({ id: 'cnt-chk' });
  const res = await run(s);
  const S = res.script.scenes.map((x) => ({ ...x }));
  const cs = counterIdx(res.script);
  S[cs[1]].counterStyle = S[cs[0]].counterStyle; // art arda aynı
  S[cs[3]] = { ...S[cs[3]], counterStyle: 'photo' };
  S[cs[3] - 1] = { type: 'words', text: 'a b', mood: 'curious', dur: 3, say: 'x y.' };
  S[cs[3] - 2] = { type: 'counter', to: 5, dur: 3, say: 'z.' };
  S[cs[4]].counterStyle = 'ticker'; // suçta borsa şeridi yok
  const short = S.findIndex((x) => x.type === 'words' && x.text.split(' ').length < 4);
  S[short] = { ...S[short], text: 'gone for good', keyword: undefined, textStyle: 'lower-third' };
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /ardışık sayaç aynı stil/);
  assert.match(v, /photo sayacın önünde resim yok/);
  assert.match(v, /sayaç stili ticker bu dönem\/tür için geçersiz/);
  assert.match(v, /lower-third bilgi \(isim\/yer\/tarih\/sayı\) taşımayan satırda/);
  // yedek plan bilgi taşımayan satıra lower-third koymaz
  assert.ok(!res.script.scenes.some((x) => x.textStyle === 'lower-third' && A.shortLine(x)));
});

test('sayaç kataloğu motorla aynı: kimlikler, yıllar, türler; her varyantın listesi', () => {
  const L = readCat('looks-catalog.json');
  assert.deepEqual(sorted(L.counterStyles.map((x) => x.id)), sorted(A.COUNTER_STYLES));
  for (const c of L.counterStyles) {
    const info = A.COUNTER_INFO[c.id] || {};
    assert.equal(c.fromYear, info.fromYear, `${c.id} fromYear`);
    assert.deepEqual(c.genres === 'all' ? undefined : sorted(c.genres), info.genres ? sorted(info.genres) : undefined, `${c.id} genres`);
    assert.equal(!!c.needsPicture, !!info.needsPicture, `${c.id} needsPicture`);
  }
  const cats = A.loadCatalogs();
  for (const vs of Object.values(L.variants)) for (const v of vs) {
    assert.ok(v.counterStyles.length >= 4, v.id);
    assert.deepEqual(cats.looks.find((l) => l.id === v.id).counterStyles.slice(0, v.counterStyles.length), v.counterStyles, v.id);
  }
});

/* ---------------------------------------------------------------- slam vuruşu, kanca, alt sınırlar */

const SLAM_BANNED = ['serif', 'typewriter', 'lower-third', 'underline', 'marker', 'lyric'];
function assertPunch(res, label) {
  const S = res.script.scenes;
  const slams = S.map((x, i) => ({ x, i })).filter(({ x }) => x.type === 'slam');
  assert.ok(slams.length, `${label}: slam yok`);
  slams.forEach(({ x, i }, k) => {
    assert.ok(A.IMPACT_TEXT.includes(x.textStyle) && !SLAM_BANNED.includes(x.textStyle), `${label} #${i}: slam stili ${x.textStyle}`);
    if (k) assert.notEqual(x.textStyle, slams[k - 1].x.textStyle, `${label} #${i}: ardışık slam aynı stil`);
    assert.equal(x.energy, 5, `${label} #${i}: slam enerjisi`);
    // 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, "anlık efektler doğal değil"): slam vuruş efekti zorunlu
    // değil — vuruş efekti, kamera vuruşu (push-in) ya da hiç efekt; başka efekt ve vignette-pulse yok.
    assert.ok(!(x.fx || []).length || (x.fx || []).some((f) => A.HIT_FX.includes(f) || f === A.SLAM_PUNCH_FX), `${label} #${i}: slam efekti ${x.fx}`);
    assert.ok(!(x.fx || []).includes('vignette-pulse'), `${label} #${i}: slam'de vignette-pulse`);
    if (i) assert.ok(A.SHARP_TRANSITIONS.has(x.transition), `${label} #${i}: slam geçişi ${x.transition}`);
  });
  assert.ok(slams.some(({ x }) => (x.fx || []).some((f) => A.HIT_FX.includes(f))), `${label}: hiçbir slam vuruş efekti almadı`);
  // vuruşlar seyrek: ifşa/kanca dışında iki slam vuruşu arasında en az SLAM_HIT_GAP_SEC
  const { starts } = sceneTimes(res.script);
  const hits = slams.filter(({ x }) => (x.fx || []).some((f) => A.HIT_FX.includes(f)));
  hits.forEach(({ x, i }, k) => { if (k && x.mood !== 'reveal' && slams[0].i !== i) assert.ok(starts[i] - starts[hits[k - 1].i] >= A.SLAM_HIT_GAP_SEC, `${label} #${i}: slam vuruşu öncekinden ${Math.round(starts[i] - starts[hits[k - 1].i])} sn sonra`); });
  for (const x of S) if (x.type === 'montage' && x.text) assert.ok(A.IMPACT_TEXT.includes(x.textStyle), `${label}: montaj stili ${x.textStyle}`);
}

test('slam: vurucu stil (dönüşümlü), enerji 5, vuruş efekti, keskin giriş; kanca kinetic; montaj vurucu', async () => {
  for (const id of ['sl1', 'sl2', 'sl3', 'sl4', 'sl5']) {
    const s = fixture({ id });
    const res = await run(s);
    assert.deepEqual(res.violations, [], id);
    assertPunch(res, id);
    const { starts } = sceneTimes(s);
    const hook = A.hookIndex(res.script.scenes, starts);
    assert.ok(hook >= 0 && starts[hook] < 30);
    assert.equal(res.script.scenes[hook].textStyle, 'kinetic', `${id}: kanca`);
    assert.ok(res.script.scenes.filter((x) => A.ACCENT_TEXT.has(x.textStyle)).length <= 3);
  }
  // gerçek senaryolar da (Titanic'in "sank" slam'i dahil)
  const dir = path.join(ROOT, 'docu-engine/videos/long-en');
  for (const f of ['documentary.json', 'crime.json', 'epic.json']) {
    const script = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const res = await run(script);
    assert.deepEqual(res.violations, [], f);
    assertPunch(res, f);
  }
});

test('regresyon: Opus boş geçiş/efekt ve yalnızca sakin stiller döndürürse alt sınırlar yedek planlayıcıyla dolar', async () => {
  const s = fixture({ id: 'empty-opus', n: 100 });
  const llm = async () => ({
    variant: 'cold-blue-case', textStyles: ['lower-third', 'underline', 'serif', 'marker'], transitions: [], accents: [],
    chapterLooks: [],
    // her sahne düz kesme, efekt yok, her resim static, slam'ler ince serif
    scenes: s.scenes.map((x, i) => ({ scene: i, transition: 'cut', fx: [], ...(A.isGradeScene(x) ? { camera: 'static' } : {}), ...(A.isTextScene(x) ? { textStyle: x.type === 'slam' ? 'serif' : 'lower-third' } : {}) })),
  });
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.equal(res.mode, 'llm');
  assert.deepEqual(res.violations, []);
  const S = res.script.scenes;
  assert.ok(res.plan.palette.transitions.length >= 3, `palet: ${res.plan.palette.transitions}`);
  const elig = S.map((x, i) => i).filter((i) => i > 0 && (S[i].type === 'slam' || (S[i].energy >= 3 && S[i].chapter === S[i - 1].chapter)));
  assert.ok(elig.filter((i) => S[i].transition !== 'cut').length / elig.length >= 0.25, 'süslü geçiş >= %25');
  const pics = S.filter(A.isGradeScene);
  // Taban %22 → %12 (29 Ekim 2026: efekt anlatım vuruşuna bağlı, sakin bilgi çekimi temiz kalır).
  assert.ok(pics.filter((x) => x.fx?.length).length / pics.length >= A.RULES.minPictureFxShare, `resimli sahnelerde efekt >= %${A.RULES.minPictureFxShare * 100}`);
  const still = pics.filter((x) => ['static', 'drift'].includes(x.camera)).length / pics.length;
  assert.ok(still >= 0.25 && still <= 0.33, `durağan %${Math.round(still * 100)}`);
  assert.ok(S.some((x) => A.isTextScene(x) && A.IMPACT_TEXT.includes(x.textStyle)), 'vurucu stil var');
  assertPunch(res, 'empty-opus');
});

test('checkPlan alt sınırları ve slam kurallarını yakalar', async () => {
  const res = await run(fixture({ id: 'min-chk', n: 100 }));
  const S = res.script.scenes.map((x) => {
    const y = { ...x, transition: 'cut' };
    delete y.fx;
    if (A.isGradeScene(x)) y.camera = x.energy >= 4 ? 'push-in' : 'static';
    // slam'in efektsiz olması artık serbest; vuruş olmayan bir efekt (dust) yakalanır
    if (x.type === 'slam') { y.textStyle = 'serif'; y.fx = ['dust']; }
    return y;
  });
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /süslü geçiş az/);
  assert.match(v, /resimli sahnelerde efekt az/);
  assert.match(v, /slam vurucu olmayan stil serif/);
  assert.match(v, /slam vuruş efekti yok/);
  assert.match(v, /slam'e keskin geçiş yok/);
  assert.match(v, /durağan kamera payı/);
});
/* ---------------------------------------------------------------- açılış (script.opening) */

const O = await import('../src/pipeline/docu-opening.js');
const PLAN = await import('../docu-engine/src/opening/plan.js');

/** Açılışı zengin bir senaryo: başlıktan önce montaj + tarih/saat + resimler, sonra bir harita sahnesi. */
function openFixture(id, o = {}) {
  const s = fixture({ id, ...o });
  const sc = s.scenes;
  sc[1] = { ...sc[1], say: '[quietly] November twenty-fourth, nineteen seventy-one. Eight-thirteen PM.', chapter: 0 };
  sc[2] = { type: 'photo', mood: 'tension', say: 'The man on the rear stairs is gone.', dur: 5, source: 'archive', search: 'jet stairs', imagePrompt: 'jet stairs at night', chapter: 0 };
  sc.splice(4, 0, { type: 'title', mood: 'tension', say: 'The only unsolved hijacking.', dur: 4, title: 'The Man Who Jumped', kicker: 'D.B. Cooper · 1971', imagePrompt: 'jet', chapter: 0 });
  sc.splice(30, 0, { type: 'map', mood: 'curious', say: 'From Portland north to Seattle.', dur: 5, region: 'pacific-northwest', points: [{ label: 'Portland', x: 0.4, y: 0.7 }, { label: 'Seattle', x: 0.45, y: 0.2 }], route: [0, 1], focus: 1, chapter: 1 });
  return s;
}

test('açılış: uygunluk motorun planlayıcısıyla aynı (harita bölgesi, gerçek alıntı, tarih/saat, dönem)', () => {
  const dir = path.join(ROOT, 'docu-engine/videos/long-en');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const crime = O.openingChoices(read('crime.json'), [], 1971);
  assert.equal(crime.eligibility['map-dive'].ok, false, 'Cooper senaryosunda harita yok');
  assert.equal(crime.eligibility.timestamps.ok, true);
  assert.match(crime.eligibility.timestamps.why, /8:13 PM/);
  assert.equal(crime.eligibility.quote.ok, false, 'açılışta tırnaklı alıntı yok');
  const epic = O.openingChoices(read('epic.json'), [], 1453);
  assert.equal(epic.eligibility.headlines.ok, false, '1453 kuşatmasında gazete yok');
  assert.equal(epic.eligibility['map-dive'].ok, true);
  assert.match(epic.eligibility['map-dive'].why, /Constantinople/);
  // gerçek bir alıntı ilk vuruşlardaysa quote uygun; uydurma alıntı yok
  const q = read('inspire.json');
  q.scenes[1] = { ...q.scenes[1], say: 'All he told reporters: I am in too much grief to talk.' };
  const qc = O.openingChoices(q, [], 1943);
  assert.equal(qc.eligibility.quote.ok, true);
  assert.equal(PLAN.openingFacts(q).quote.text, 'I am in too much grief to talk.');
  // damgalar yalnızca anlatımdan: sayı ≠ tarih
  assert.equal(PLAN.stampOf({ say: 'Two thousand, two hundred twenty-four people on board.' }, 'en-US'), null);
  assert.equal(PLAN.stampOf({ say: 'November twenty-fourth, nineteen seventy-one.' }, 'en-US').text, 'NOV 24, 1971');
  assert.equal(PLAN.stampOf({ say: '29 Ekim 1929, saat 10.00.' }, 'tr-TR').text, '29 EKİM 1929 · 10.00');
  assert.equal(PLAN.stampOf({ say: '[sessizce] Saat yirmiyi on üç geçe...' }, 'tr-TR').text, '20.13');
  assert.equal(PLAN.stampOf({ say: 'Saat iki kişi geldi.' }, 'tr-TR'), null);
});

test('açılış: her videoda seçilir, kanal genelinde son 2 videodan farklı, geçmişe yazılır', async () => {
  const hist = tmp('hist');
  const kinds = [];
  const genres = ['crime', 'finance', 'documentary', 'horror', 'science', 'inspire', 'crime'];
  for (const [k, genre] of genres.entries()) {
    const res = await run(openFixture(`op-${k}`, { genre }), { historyFile: hist });
    assert.deepEqual(res.violations, [], `op-${k}`);
    assert.ok(O.OPENING_KINDS.includes(res.plan.opening?.kind), `op-${k}: açılış seçilmedi`);
    assert.equal(res.script.opening.kind, res.plan.opening.kind);
    kinds.push(res.plan.opening.kind);
  }
  kinds.forEach((kd, i) => {
    if (i >= 1) assert.notEqual(kd, kinds[i - 1], `video ${i} bir öncekinin açılışını tekrarladı`);
    if (i >= 2) assert.notEqual(kd, kinds[i - 2], `video ${i} iki öncekinin açılışını tekrarladı`);
  });
  const h = JSON.parse(fs.readFileSync(hist, 'utf8'));
  assert.deepEqual(h.map((e) => e.opening), kinds);
  // motor aynı senaryoda aynı türü çizer (uygun olduğu için)
  for (const [k, genre] of genres.entries()) {
    const s = { ...openFixture(`op-${k}`, { genre }), opening: { kind: kinds[k] } };
    // 'montage' = the classic signature opening, the engine's own: no treatment layer to resolve.
    if (kinds[k] === 'montage') assert.equal(PLAN.resolveOpening(s), null);
    else assert.equal(PLAN.resolveOpening(s)?.kind, kinds[k]);
  }
});

test('açılış: model önerisi uygunsa korunur; uygunsuz ya da son videolarda kullanılmışsa yedek seçim', async () => {
  const base = openFixture('op-llm');
  const llm = (opening) => async ({ schema }) => {
    assert.ok(schema.properties.opening, 'şemada açılış alanı yok');
    return { opening, variant: '', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] };
  };
  const ok = await A.artDirect(base, { llm: llm('timestamps'), settings: { anthropicKey: 'x' }, historyFile: tmp('hist'), logFn: noLog });
  assert.equal(ok.plan.opening.kind, 'timestamps');
  // harita bölgesi yokken map-dive reddedilir
  const noMap = { ...base, scenes: base.scenes.filter((x) => x.type !== 'map') };
  const bad = await A.artDirect(noMap, { llm: llm('map-dive'), settings: { anthropicKey: 'x' }, historyFile: tmp('hist'), logFn: noLog });
  assert.notEqual(bad.plan.opening.kind, 'map-dive');
  assert.ok(bad.plan.notes.some((n) => /model açılışı map-dive reddedildi/.test(n)));
  // son 2 videoda kullanılan reddedilir
  const hist = tmp('hist');
  fs.writeFileSync(hist, JSON.stringify([{ id: 'a', genre: 'crime', variant: 'x', opening: 'timestamps' }, { id: 'b', genre: 'epic', variant: 'y', opening: 'evidence' }]));
  const blocked = await A.artDirect(base, { llm: llm('timestamps'), settings: { anthropicKey: 'x' }, historyFile: hist, logFn: noLog });
  assert.ok(!['timestamps', 'evidence'].includes(blocked.plan.opening.kind), blocked.plan.opening.kind);
  assert.deepEqual(blocked.violations.filter((m) => /açılış/.test(m)), []);
});

test('checkPlan açılış ihlallerini yakalar (geçersiz, uygunsuz, dönem dışı, son 2 videoda)', async () => {
  const s = openFixture('op-chk');
  assert.match(A.checkPlan({ ...s, opening: { kind: 'spin' } }).join('\n'), /açılış türü geçersiz/);
  const noMap = { ...s, scenes: s.scenes.filter((x) => x.type !== 'map'), opening: { kind: 'map-dive' } };
  assert.match(A.checkPlan(noMap).join('\n'), /açılış map-dive bu senaryoya uygun değil/);
  assert.match(A.checkPlan({ ...s, era: '1453', opening: { kind: 'headlines' } }).join('\n'), /açılış headlines .*newspapers in 1453/);
  const history = [{ id: 'z1', variant: 'v', opening: 'cold-open' }, { id: 'z2', variant: 'w', opening: 'quote' }];
  assert.match(A.checkPlan({ ...s, opening: { kind: 'cold-open' } }, { history }).join('\n'), /açılış cold-open son 2 videoda/);
  assert.equal(A.checkPlan({ ...s, opening: { kind: 'cold-open' } }, { history: [...history, { id: 'z3', variant: 'u', opening: 'evidence' }] }).filter((m) => /açılış/.test(m)).length, 0);
  // yoksa (eski plan) kural yok; motor bugünkü açılışı çizer
  assert.equal(A.checkPlan(s).filter((m) => /açılış/.test(m)).length, 0);
  assert.equal(PLAN.resolveOpening(s), null);
  assert.equal(PLAN.resolveOpening({ ...noMap, opening: { kind: 'map-dive' } }), null);
});

/* ------------------------------------------------- ekran yazısı ve zeminler */

const W = (text, keyword, extra = {}) => ({ type: 'words', mood: 'curious', say: `And so, ${text}.`, dur: 4, text, ...(keyword ? { keyword } : {}), imagePrompt: 'p', ...extra });

test('ekran yazısı sınıflandırıcısı: sayı/tarih/saat/ad/alıntı bilgi; düz ifade değil', () => {
  const info = (text) => A.captionFacts(W(text)).info;
  assert.ok(info('The last radio signal cut out at 2:17'));
  assert.ok(info('one thousand one hundred seventy-eight seats'));
  assert.ok(info('April 15, 1912'));
  assert.ok(info('handed one to White Star chairman Bruce Ismay'));
  assert.ok(info('fifty-two in third class'));
  assert.ok(!info('lowered half empty'));
  assert.ok(!info('no one knew if anyone was coming'));
  assert.ok(!info('Everyone thinks they have been saved'), 'cümle başındaki büyük harf ad değildir');
  assert.ok(A.captionFacts({ ...W('Shut up I am busy'), say: 'Phillips snapped back: Shut up... I am busy!' }).quote);
  // anahtar kelimenin gücü
  assert.equal(A.captionFacts(W('lowered half empty', 'empty')).keyStrong, true);
  assert.equal(A.captionFacts(W('something no one expected', 'something')).keyStrong, false);
  assert.equal(A.captionFacts(W('gave way to panic', 'terror')).keyword, null, 'metinde olmayan anahtar sayılmaz');
  // karar
  const d = (s, o) => A.captionDecision(s, o).mode;
  assert.equal(d(W('The last radio signal cut out at 2:17', 'signal')), 'full');
  // 1.16.16: bilgisiz yankı yalnızca zirvede (enerji >= 4) ve seyrek (>= 30 sn); kalanı temiz görüntü
  assert.equal(d(W('lowered half empty', 'empty')), 'none', 'zirve değil: yankı yazısı yok');
  assert.equal(d(W('lowered half empty', 'empty'), { energy: 4 }), 'full', 'zirvede kısa güçlü satır tam');
  assert.equal(d(W('But the real damage was below the waterline', 'waterline')), 'none', 'uzun yankı satırı yazısız');
  assert.equal(d(W('But the real damage was below the waterline', 'waterline'), { energy: 5 }), 'key', 'zirvede uzun satır anahtar kelimeye iner');
  assert.equal(d(W('lowered half empty', 'empty'), { energy: 5, gapSec: 12 }), 'none', 'yankılar arası 30 sn');
  assert.equal(d(W('something no one expected')), 'none', 'anahtarsız dolgu yazısız');
  assert.equal(d(W('something no one expected'), { pictured: false }), 'full', 'resimsiz sahne yazısız kalmaz');
  assert.equal(d(W('nowhere left to go'), { hook: true }), 'full');
});

function captionFixture(id) {
  const s = fixture({ id, genre: 'documentary', era: '1912' });
  const lines = [
    ['The last radio signal cut out at 2:17', 'signal'],
    ['lowered half empty', 'empty'],
    ['But the real damage was below the waterline and nobody knew', 'waterline'],
    ['something no one expected', null],
    ['handed one to White Star chairman Bruce Ismay', 'Ismay'],
    ['the eerie calm gave way to panic', 'panic'],
  ];
  let k = 0;
  s.scenes = s.scenes.map((x, i) => (x.type === 'words' && i > 30 ? { ...x, imagePrompt: x.bg ? undefined : 'a picture', text: lines[k % lines.length][0], ...(lines[k % lines.length][1] ? { keyword: lines[k++ % lines.length][1] } : (k++, { keyword: undefined })) } : x));
  return s;
}

test('yedek plan: her words sahnesine ekran yazısı kararı; bilgi satırı asla yazısız, lower-third yalnızca bilgi satırında', async () => {
  const s = captionFixture('cap-a');
  const res = await run(s);
  assert.deepEqual(res.violations, []);
  const words = res.script.scenes.filter((x) => x.type === 'words');
  assert.ok(words.every((x) => A.CAPTION_MODES.includes(x.textMode)), 'her words sahnesinin kararı var');
  for (const x of words) {
    const f = A.captionFacts(x);
    if (f.info || f.quote) assert.equal(x.textMode, 'full', `bilgi satırı tam: ${x.text}`);
    if (x.textMode === 'none') assert.ok(!f.info && !f.quote && (x.image || x.imagePrompt || x.search || x.bg === 'prev'), x.text);
    if (x.textMode !== 'none' && !f.info && !f.quote) assert.ok(x.energy >= 4 || !(x.image || x.imagePrompt || x.search || x.bg === 'prev'), `yankı yazısı yalnızca zirvede: ${x.text}`);
    if (x.textMode === 'key') assert.ok(f.keyword, x.text);
    if (x.textStyle === 'lower-third') assert.ok(f.info && x.textMode === 'full', `lower-third bilgi satırında: ${x.text}`);
  }
  // 1.16.16: bilgi satırları hep yazılı; yankılar seyrek (tutmuş kanallarda ekran yazısı bilgidir)
  const echoes = words.filter((x) => x.textMode !== 'none' && !A.captionFacts(x).info && !A.captionFacts(x).quote);
  assert.ok(echoes.length <= Math.ceil(words.length * 0.25), `${echoes.length}/${words.length} yankı`);
  assert.ok(words.some((x) => x.textMode === 'none' && x.text === 'something no one expected'));
  // checkPlan: bilgi satırını yazısız bırakmak ve bilgisiz satıra lower-third yakalanır
  const S = res.script.scenes.map((x) => ({ ...x }));
  const inf = S.findIndex((x) => x.type === 'words' && A.captionFacts(x).info && x.textMode === 'full');
  S[inf].textMode = 'none';
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /bilgi\/alıntı taşıyan satır yazısız bırakılmış/);
});

test('model önerisi: bilgi satırına none ve dolguya lower-third onarılır', async () => {
  const s = captionFixture('cap-llm');
  const llm = async ({ schema, user }) => {
    assert.ok(schema.properties.scenes.items.properties.caption.enum.includes('none'));
    assert.match(user, /\{[A-Z]*W\+\}/, 'bilgi satırları işaretli');
    const scenes = s.scenes.map((x, i) => ({ scene: i, transition: 'cut', ...(x.type === 'words' ? { caption: 'none', textStyle: 'lower-third' } : {}) }));
    return { variant: 'x', textStyles: ['lower-third', 'serif', 'underline', 'stack'], transitions: [], accents: [], chapterLooks: [], scenes };
  };
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(res.violations, []);
  for (const x of res.script.scenes.filter((y) => y.type === 'words')) {
    if (A.captionFacts(x).info) assert.equal(x.textMode, 'full', x.text);
    if (x.textStyle === 'lower-third') assert.ok(A.captionFacts(x).info, x.text);
  }
});

test('büyük yazı boş zeminde durmaz: related (ilgili resim) ya da era; düz zemin yalnızca sessizlik anı (enerji 1, en çok 2)', async () => {
  const BIG = new Set(['words', 'slam', 'title', 'counter', 'quote']);
  for (const [id, genre, era] of [['bd-a', 'crime', '1971'], ['bd-b', 'finance', '1929-1933'], ['bd-c', 'documentary', '1912']]) {
    const s = fixture({ id, genre, era });
    const res = await run(s);
    assert.deepEqual(res.violations, [], id);
    const big = res.script.scenes.filter((x) => BIG.has(x.type) && x.backdrop);
    assert.ok(big.length >= 5, id);
    for (const x of big) assert.ok(A.RELATED_BACKDROPS.has(x.backdrop.kind) || (A.SILENCE_BACKDROPS.has(x.backdrop.kind) && x.energy === 1 && A.GENTLE_MOODS.has(x.mood)), `${id}: ${x.type} ${x.backdrop.kind}`);
    assert.ok(big.filter((x) => A.SILENCE_BACKDROPS.has(x.backdrop.kind)).length <= A.SILENCE_BEATS_MAX);
    // hepsi koyu değil: açık tonlu ilgili resim de sayılır
    assert.ok(res.script.scenes.filter((x) => A.isLightBackdrop(x.backdrop)).length >= 3, id);
  }
  // model: sayaca blueprint, enerji 3 sayaca solid → related; enerji 1 sahneye solid (sessizlik) kabul, en çok 2
  const s = fixture({ id: 'bd-llm', genre: 'finance', era: '1929' });
  const llm = async () => ({
    variant: 'x', textStyles: [], transitions: [], accents: [], chapterLooks: [],
    scenes: s.scenes.map((x, i) => ({ scene: i, transition: 'cut', ...(x.type === 'counter' ? { backdrop: { kind: i % 2 ? 'blueprint' : 'solid', color: '#101820' } } : {}) })),
  });
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(res.violations, []);
  const cs = res.script.scenes.filter((x) => x.type === 'counter');
  assert.ok(cs.every((x) => x.backdrop.kind !== 'blueprint'));
  assert.ok(cs.filter((x) => x.backdrop.kind === 'solid').every((x) => x.energy === 1 && A.GENTLE_MOODS.has(x.mood)));
  assert.ok(cs.filter((x) => x.backdrop.kind === 'solid').length <= 2);
  assert.ok(cs.some((x) => x.backdrop.kind === 'related'));
  // checkPlan: enerji 3 sayaçta düz zemin ve büyük yazıda blueprint yakalanır
  const S = res.script.scenes.map((x) => ({ ...x }));
  const c = S.findIndex((x) => x.type === 'counter' && x.energy !== 1);
  S[c] = { ...S[c], backdrop: { kind: 'solid', color: '#000000' } };
  const c2 = S.findIndex((x, i) => i > c && x.type === 'counter');
  S[c2] = { ...S[c2], backdrop: { kind: 'blueprint' } };
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /büyük yazı düz zeminde \(solid\)/);
  assert.match(v, /büyük yazı boş zeminde \(blueprint\)/);
});

test('motor kataloğu: related ve era zeminleri, editoryal lower-third', () => {
  const L = readCat('looks-catalog.json');
  const ids = L.backdrops.map((x) => x.id);
  assert.ok(ids.includes('related') && ids.includes('era'));
  assert.match(L.textStyles.find((x) => x.id === 'lower-third').description, /ONLY for lines that carry a name, place, date\/time or number/);
  assert.match(L.backdrops.find((x) => x.id === 'solid').description, /SILENCE BEATS ONLY/);
});

test('alıntı: anlatımda iki noktadan sonra ekrandaki söz', () => {
  const q = { type: 'words', say: 'Lamont tells the press: There has been a little distress selling.', text: 'There has been a little distress selling', keyword: 'distress', imagePrompt: 'p' };
  assert.ok(A.captionFacts(q).quote);
  assert.equal(A.captionDecision(q).mode, 'full');
});

test('sayı olan kısa anahtar kelime bilgidir: "only one boat went back" yazısız kalmaz', () => {
  const s = { type: 'words', say: 'Only one boat went back.', text: 'only one boat went back', keyword: 'one', imagePrompt: 'p' };
  assert.ok(A.captionFacts(s).info && A.captionFacts(s).keyStrong);
  assert.equal(A.captionDecision(s).mode, 'full');
  assert.ok(A.captionFacts({ ...s, text: 'then a brand-new one SOS', keyword: 'SOS' }).keyStrong);
});

/* ---------------------------------------------------------------- konu kimliği (docu-topic-bible.js) */

test('konu kimliği: sanat yönetmeni ona uyar — yazı ailesi, bağlayıcı renk, vurgu, zeminler, açılış; motif/selective serbestçe seçilmez', async () => {
  const T = await import('../src/pipeline/docu-topic-bible.js');
  const dir = path.join(ROOT, 'docu-engine/videos/long-en');
  for (const g of ['documentary', 'finance', 'crime']) {
    const s0 = JSON.parse(fs.readFileSync(path.join(dir, `${g}.json`), 'utf8'));
    const { script: s } = await T.topicBible(s0, { llm: false });
    const plain = await run(s0);
    const res = await run(s);
    assert.deepEqual(res.violations, [], `${g}: kurallar yine sağlanır`);
    const fam = s.topic.textStyles;
    assert.ok(res.plan.palette.textStyles.filter((x) => fam.includes(x)).length >= 3, `${g}: yazı stillerinin en az üçü konu ailesinden`);
    // 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730: luma 52-56, doygunluk 2,5-6): konunun tabanı RENKLİ,
    // seçici renk yalnızca vurgu (accentGrade) — eskiden 'selective' her bölümün bağlayıcı tabanıydı.
    assert.ok(A.COLOUR_GRADES.includes(s.topic.grade), `${g}: konu tabanı renkli (${s.topic.grade})`);
    assert.ok(res.plan.chapterLooks.every((c) => A.baseGradeOk(c.grade, A.eraRange(s.era)?.start)), `${g}: bölüm tabanları renkli`);
    const accCh = new Set(res.script.scenes.filter((x) => x.grade && A.accentGradeOf(x.grade, A.eraRange(s.era)?.start)).map((x) => x.chapter));
    assert.ok(accCh.size <= 1 && !accCh.has(0), `${g}: soldurucu vurgu en çok bir bölümde, kancada değil`);
    assert.equal(res.plan.chapterLooks[0].accent, s.topic.accent, `${g}: ilk bölüm konunun vurgusunda`);
    for (const x of res.plan.scenes) assert.notEqual(x.textStyle, 'motif', 'motif yazısını yalnızca konu kimliği koyar');
    for (const x of plain.plan.scenes) assert.notEqual(x.grade, 'selective', 'kimliksiz videoda seçici renk yok');
    assert.notEqual(A.artKey(s), A.artKey(s0), 'kimlik planın anahtarına girer');
    if (res.plan.opening?.kind && s.topic.opening) {
      const elig = A.topicOf(s);
      assert.ok(elig.opening);
    }
  }
  // istem kimliği bağlayıcı olarak anlatır
  const s0 = JSON.parse(fs.readFileSync(path.join(dir, 'documentary.json'), 'utf8'));
  const { script: s } = await T.topicBible(s0, { llm: false });
  const looks = A.loadCatalogs().looks.filter((l) => l.genres.includes('documentary'));
  const { user } = A.artPrompt(s, { looks, allowed: { textStyle: A.REGULAR_TEXT, transition: A.TRANSITIONS, grade: A.GRADES, fx: A.FX_KINDS, counterStyle: A.COUNTER_STYLES }, recent: [] });
  assert.match(user, /TOPIC IDENTITY \(binding/);
  assert.match(user, /motif telegraph/);
});

test('açılış kancası: tonla gelir (yedek: suç sert, destan sinematik, bilim sessiz); model önerisi geçerliyse korunur; geçersizi yakalanır', async () => {
  const kinds = {};
  for (const [genre, want] of [['crime', 'impact'], ['epic', 'cinematic'], ['science', 'quiet'], ['inspire', 'quiet'], ['finance', 'impact'], ['documentary', 'cinematic']]) {
    const res = await run(openFixture(`hk-${genre}`, { genre, era: genre === 'epic' ? '1453' : '1971' }), { historyFile: tmp('hist') });
    assert.equal(res.plan.opening.hook, want, genre);
    assert.equal(res.script.opening.hook, want, genre);
    kinds[genre] = res.plan.opening.kind;
  }
  const llm = async () => ({ opening: 'timestamps', openingHook: 'quiet', variant: '', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] });
  const r = await A.artDirect(openFixture('hk-llm'), { llm, settings: { anthropicKey: 'x' }, historyFile: tmp('hist'), logFn: noLog });
  assert.deepEqual(r.plan.opening, { kind: 'timestamps', hook: 'quiet' });
  assert.match(A.checkPlan({ ...openFixture('hk-bad'), opening: { kind: 'timestamps', hook: 'loud' } }).join('\n'), /açılış kancası geçersiz/);
  // motor aynı tonu okur
  assert.equal(PLAN.resolveOpening({ ...openFixture('hk-x', { genre: 'science' }), opening: { kind: 'timestamps' } }).hook, 'quiet');
  assert.equal(PLAN.resolveOpening({ ...openFixture('hk-y', { genre: 'science' }), opening: { kind: 'timestamps', hook: 'impact' } }).hook, 'impact');
});
