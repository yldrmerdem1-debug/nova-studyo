// ÖN İZLEME KAPISININ TURU SÜRESİZ BEKLEMEZ, DÜZELTEMEDİĞİNE "TEMİZ" DEMEZ (docu.js 5d).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması 20261024-373aaf): kapının 2. turu 17:13:51'de (props.json yazıldı)
// sustu ve iş 48 dk hiçbir şey yapmadan bekledi. Motorun bekçisi (25 dk) yalnızca motoru görür; kare çizici, görme modeli,
// yeniden seçim ve aralarındaki sözler turu süresiz bekletebiliyordu. Yeniden deneme de olamazdı: tek hak (gateRetries=1)
// İŞ başınaydı ve 16:45'te 1. turun kapak tarayıcısı zaman aşımı onu harcamıştı. Ayrıca (2. tur inceleme R4) bozuk karenin
// basamakları bitince ya da yalnızca raporlanan bir bulguda plan boş kalıyor, kapı kayda clean:true yazıp "Ön izleme temiz
// — düzeltilecek sorun kalmadı" diyordu, son raporda orta/yüksek bulgu dururken. 2. tur R2/R3'ün docu.js'e bıraktıkları:
// yazar okuma hızını bilmiyordu (voiceSpeed), kaynak videonun hatasında ödenen çağrılar hemen kaydedilmiyordu (saveUsage).
//
// DÜZELTME: gateWatchdog — günlük satırı, motor çıktısı, çizilen kare yoksa docuGateStallMs (10 dk) sonra turun süreç
// ağaçları kesilir, tur "Ön izleme N dk ilerlemedi" ile catch'e düşer; yeniden deneme hakkı TUR başına bir; açık bulgular
// (openGateFindings) kapıyı temiz yapmaz, günlüğe ve kalite uyarısına yazılır.
// Gerçek süreç, ağ, model YOK: spawn sahte; docu.js kaynağı okunur.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-bekci-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

// Yalnızca taskkill sahte olarak "başlar" (ağaç kesimi kaydedilir); başka her süreç patlar.
const cp = createRequire(import.meta.url)('node:child_process');
const spawned = [];
cp.spawn = (cmd, args = []) => {
  spawned.push({ cmd, args });
  if (cmd === 'taskkill') return Object.assign(new EventEmitter(), { pid: undefined, kill() {} });
  throw new Error(`alt süreç yasak: ${cmd}`);
};
for (const f of ['spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[f] = () => { throw new Error(`alt süreç yasak: ${f}`); };
syncBuiltinESMExports();

const D = await import('../src/pipeline/docu.js');
const P = await import('../src/pipeline/docu-preview.js');
const { ProcKiller } = await import('../src/util.js');
const src = fs.readFileSync(new URL('../src/pipeline/docu.js', import.meta.url), 'utf8');

let nextPid = 999999991; // tek sayı: sahte taskkill zaten hiçbir sürece dokunmaz
class FakeChild extends EventEmitter {
  constructor() { super(); this.pid = nextPid += 2; this.kills = []; }
  kill(sig) { this.kills.push(sig); return true; }
}
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
const treeKillsOf = (child) => spawned.filter((s) => s.cmd === 'taskkill' && s.args[1] === String(child.pid));

test('bekçi: tur hiç ilerlemezse adım reddedilir ve yalnızca TURUN süreç ağaçları kesilir (iş iptal sayılmaz)', async () => {
  assert.equal(D.GATE_STALL_MS, 10 * 60 * 1000, 'varsayılan 10 dk');
  const job = new ProcKiller();
  const w = D.gateWatchdog({ stallMs: 80, killer: job });
  const round = new FakeChild(); // ön izleme hazırlığı / kare çizici
  const other = new FakeChild(); // işin turdan bağımsız süreci
  w.killer.add(round);
  job.add(other);
  assert.ok(job.procs.has(round), 'turun süreci işin killer\'ında da: iş iptali onu da keser');
  const hung = new Promise(() => {}); // hiç bağlanmayan söz (kare çizici, görme çağrısı…)
  const t0 = Date.now();
  const r = await Promise.race([settle(w.race(hung)), later(3000).then(() => ({ timeout: true }))]);
  assert.ok(!r.timeout, 'bekçi turu bırakmadı (askıda)');
  assert.equal(r.ok, false);
  assert.match(r.e.message, /^Ön izleme \d+ (sn|dk) ilerlemedi — turun süreçleri durduruldu$/);
  assert.ok(Date.now() - t0 >= 70, 'sessizlik süresi dolmadan kesmez');
  assert.ok(w.stalled && w.killer.cancelled, 'takılan turun kalan adımı yeni süreç açmaz');
  assert.equal(job.cancelled, false, 'iş iptal edilmiş sayılmaz: catch yeniden deneyebilir');
  assert.deepEqual(round.kills, ['SIGKILL']);
  if (process.platform === 'win32') assert.deepEqual(treeKillsOf(round).map((s) => s.args), [['/pid', String(round.pid), '/T', '/F']], 'ağaç: taskkill /T /F');
  assert.deepEqual(other.kills, [], 'turun dışındaki süreç kesilmez');
  assert.equal(treeKillsOf(other).length, 0);
  w.stop();
});

test('bekçi: günlük/motor çıktısı/kare geldikçe tur sürer; adım bitince sonucu aynen döner, durunca bir daha kesmez', async () => {
  // Sınır (300 ms) nabzın (20 ms) 15 katı: npm test'in paralel dosyaları süreci onlarca ms bekletse de nabız kaçmaz.
  const w = D.gateWatchdog({ stallMs: 300 });
  const child = new FakeChild();
  w.killer.add(child);
  const beat = setInterval(w.touch, 20);
  const slow = later(1000).then(() => 'hazırlandı'); // sessizlik sınırının üç katından uzun, ama ilerliyor
  const r = await settle(w.race(slow));
  clearInterval(beat);
  w.stop();
  assert.deepEqual(r, { ok: true, v: 'hazırlandı' });
  await later(450);
  assert.equal(w.stalled, false, 'durdurulan bekçi tetiklenmez');
  assert.deepEqual(child.kills, []);
  // Adımın kendi hatası olduğu gibi geçer (catch'in kuralları: kutu beklemesi, teknik hata).
  const w2 = D.gateWatchdog({ stallMs: 5000 });
  const e = await settle(w2.race(Promise.reject(new Error("Sinematik motor: 65 görsel ChatGPT'den bekleniyor"))));
  w2.stop();
  assert.match(e.e.message, /ChatGPT'den bekleniyor/);
});

test('bekçi: kendi bekçisi olan adım (motorun hazırlığı) sürerken sessizlik sayılmaz; bitince saat yeniden başlar', async () => {
  const w = D.gateWatchdog({ stallMs: 60 });
  // Hazırlıkta Kling klibi dakikalarca tek satır yazmadan beklenir; motorun kendi bekçisi (25 dk) onu zaten bağlar.
  const engine = later(250).then(() => 'props');
  const r = await settle(w.race(engine, { own: true }));
  assert.deepEqual(r, { ok: true, v: 'props' });
  assert.equal(w.stalled, false);
  // Sonraki adımın sessizliği yine sayılır: saat motor bittiğinde yeniden başladı.
  const t0 = Date.now();
  const hung = await settle(w.race(new Promise(() => {})));
  assert.equal(hung.ok, false);
  assert.match(hung.e.message, /ilerlemedi/);
  assert.ok(Date.now() - t0 >= 50, 'saat motorun bitişinden sayılır');
  w.stop();
  // Kendi bekçili adımın hatası olduğu gibi geçer.
  const w2 = D.gateWatchdog({ stallMs: 5000 });
  const e = await settle(w2.race(Promise.reject(new Error('Sinematik motor 25 dakika yanıt vermedi ve durduruldu.')), { own: true }));
  w2.stop();
  assert.match(e.e.message, /^Sinematik motor 25 dakika/);
});

test('açık bulgular: basamakları biten bozuk kare (plan boş) kapıyı temiz yapmaz; düşük önem ve düzeltilen sahne sayılmaz', () => {
  const fp = (s) => s.say;
  const scenes = [
    { type: 'photo', say: 'a', image: 'build/j/a.jpg', archived: true, source: 'archive' },
    { type: 'photo', say: 'b', image: 'build/j/b.jpg', archived: true, source: 'archive' },
    { type: 'photo', say: 'c', image: 'build/j/c.jpg', archived: true, source: 'archive' },
  ];
  const broken = { scene: 2, kind: 'broken', severity: 'high', detail: 'tamamen boş bej vinyet zemin' };
  // Gerçek plan: sahne 2'nin son basamağı (prev-picture) önceki turda denendi → kapının yapacağı bir şey kalmadı.
  const plan = P.previewFixPlan([broken, { scene: 1, kind: 'mismatch', severity: 'low', detail: 'hafif' }], scenes, { fp, tried: new Map([[2, [{ kind: 'broken', fix: 'prev-picture' }]]]) });
  assert.deepEqual([plan.repick, plan.ai, plan.patches], [[], [], []], 'plan boş (eski kod burada "Ön izleme temiz" derdi)');
  const report = { round: 3, only: [2], issues: [broken, { scene: 1, kind: 'mismatch', severity: 'low', detail: 'hafif' }] };
  assert.deepEqual(D.openGateFindings([], report, []), [broken]);
  // Bu turda düzeltilen sahnenin bulgusu açık değildir (sonraki tur ona bakar).
  assert.deepEqual(D.openGateFindings([], { issues: [broken, { scene: 0, kind: 'mismatch', severity: 'medium', detail: 'x' }] }, [0]), [broken]);
  // Sahnesiz kare (bölüm kartı) de sayılır: kapı onu düzeltemez.
  assert.deepEqual(D.openGateFindings([], { issues: [{ scene: null, kind: 'text_overflow', severity: 'medium', detail: 'bölüm kartı' }] }, []).map((x) => x.scene), [null]);
});

test('açık bulgular: doğrulama turu yalnızca değişen sahnelere bakar — önceki turun açığı bakılmayan sahnede kalır', () => {
  const r1 = { round: 1, issues: [
    { scene: 10, kind: 'mismatch', severity: 'medium', detail: 'sayaçta yanlış birim' }, // yalnızca raporlanan
    { scene: 3, kind: 'mismatch', severity: 'high', detail: 'başka gemi' }, // yeniden seçilecek
    { scene: 0, kind: 'hook_slow', severity: 'medium', detail: 'kanca yavaş' }, // her turda bütün videodan yeniden
  ] };
  const open1 = D.openGateFindings(undefined, r1, [3]);
  assert.deepEqual(open1.map((x) => x.scene), [10, 0]);
  // 2. tur: yalnızca sahne 3 çizildi, temiz. Eski kod: changed=[] → "Ön izleme temiz"; sahne 10'un bulgusu kaybolurdu.
  const r2 = { round: 2, only: [3], issues: [] };
  assert.deepEqual(D.openGateFindings(open1, r2, []).map((x) => `${x.scene}:${x.kind}`), ['10:mismatch'], 'kanca bulgusu bu turda çıkmadıysa kapanmıştır');
  // Bakılan sahnenin eski açığı düşer (yeni karesi temiz); aynı bulgu iki kez durmaz.
  assert.deepEqual(D.openGateFindings(open1, { round: 2, only: [10], issues: [] }, []), []);
  assert.equal(D.openGateFindings(open1, { round: 2, only: [3], issues: [open1[0]] }, []).length, 1);
  // Tam tur (only yok) her şeye yeniden bakar: eski açık taşınmaz.
  assert.deepEqual(D.openGateFindings(open1, { round: 1, issues: [] }, []), []);
});

/** docu.js'in kapı bloğu: 5d başından 6) MOTOR'a. */
const gate = src.slice(src.indexOf('if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly)'), src.indexOf('// 6) MOTOR'));

test('kapı döngüsü: yeniden deneme hakkı TUR başına; aynı turun yeniden koşusu hakkı yenilemez', () => {
  assert.ok(gate.length > 1000, 'kapı bloğu');
  const loop = gate.indexOf('for (let round = (readPv()?.round || 0) + 1; round <= PREVIEW_ROUNDS; round++) {');
  assert.ok(gate.indexOf('let gateRetries = 1;') < loop && gate.indexOf('let retryRound = 0;') < loop);
  // Döngünün ilk satırı: yeni tur → hak yenilenir. "round--; continue;" aynı turu yeniden koşar: tur değişmez, hak yenilenmez.
  const body = gate.slice(loop).split('\n').slice(1).find((l) => l.trim() && !l.trim().startsWith('//'));
  assert.equal(body.trim(), 'if (round !== retryRound) { retryRound = round; gateRetries = 1; }');
  assert.ok(gate.includes('if (gateRetries-- > 0) {'), 'teknik hata bir kez yeniden denenir');
  assert.equal((gate.match(/round--; continue;|round--;\n\s*continue;/g) || []).length, 2, 'Commons dolgusu + teknik hata: aynı tur');
  assert.ok(!/gateRetries = 1;[^\n]*\n[^]*if \(gateRetries-- > 0\)[^]*gateRetries = 1/.test(gate), 'hak başka yerde yenilenmez');
});

test('kapı döngüsü: turun her beklenen adımı bekçiye bağlı; bekçi günlük, motor çıktısı ve çizilen kareyle beslenir', () => {
  assert.ok(gate.includes('const gateStallMs = Number(settings.docuGateStallMs) > 0 ? Number(settings.docuGateStallMs) : GATE_STALL_MS;'));
  const start = gate.indexOf('const watch = gateWatchdog({ stallMs: gateStallMs, killer });');
  const tryAt = gate.indexOf('try {', start);
  const catchAt = gate.indexOf('} catch (e) {', tryAt);
  assert.ok(start > 0 && tryAt > start && catchAt > tryAt, 'bekçi turun try bloğundan önce kurulur');
  const body = gate.slice(tryAt, catchAt);
  // Bekçisiz tek bir await bile turu süresiz bekletebilir (17:13'teki gibi): yalnızca yerel modül yüklemesi muaf.
  const awaits = body.match(/await [^\n]{0,40}/g) || [];
  assert.ok(awaits.length >= 5, awaits.join(' | '));
  for (const a of awaits) assert.ok(a.startsWith('await watch.race(') || a.startsWith('await import(pathToFileURL('), `bekçisiz bekleme: ${a}`);
  for (const s of [
    'await watch.race(runDocuEngine({',
    'voiceId, settings, killer: watch.killer, prepareOnly: true,',
    'onLog: log2, onActivity: watch.touch,',
    // Motorun hazırlığı kendi bekçisiyle (STALL_MS + exit payı) her durumda bağlanır: kapı onun sessizliğini saymaz.
    'onProgress: engineProgress((p) => updateJob(jobId, p), { from: 15, span: 20 }),\n        }), { own: true });',
    'const pv = await watch.race(previewGate({',
    'isCancelled: () => isCancelled() || watch.stalled,',
    'workDir: path.join(dir, "on-izleme-site"), killer: watch.killer, logFn: watch.touch,',
    'const again = await watch.race(prepareEngineDocu());',
    'engineDocu = await watch.race(finishEngineDocu(again.engineDocu, credits, { fresh: true }));',
  ]) assert.ok(body.includes(s), s);
  assert.match(gate.slice(catchAt), /\} finally \{\n\s*watch\.stop\(\);\n\s*gateTouch = \(\) => \{\};\n\s*\}/, 'bekçi her yolda durur');
  // Günlük satırları (prepareEngineDocu, previewGate, arşiv adımı) bekçiyi besler.
  assert.ok(src.includes('const log2 = (m) => { gateTouch(); log(jobId, m); };'));
  assert.ok(gate.includes('gateTouch = watch.touch;'));
  assert.ok(src.includes('onProgress: (d, n) => { gateTouch(); updateJob(jobId, { message: `Arşivde gerçek fotoğraflar aranıyor... ${d}/${n}` }); },'));
  // Bekçinin hatası teknik hatadır: kutu beklemesi kuralına (inboxWaitAction) takılmaz.
  assert.ok(!/ChatGPT'den bekleniyor/.test('Ön izleme 10 dk ilerlemedi — turun süreçleri durduruldu'));
});

test('kapı kaydı: açık bulgu varken clean:false, "temiz" denmez; bulgular günlüğe ve kalite uyarısına yazılır', () => {
  assert.ok(gate.includes('const open = openGateFindings(before.open, pv.report, changed);'));
  assert.ok(gate.includes('clean: !changed.length && !open.length,'), 'temiz: değişen de açık bulgu da yok');
  assert.ok(gate.includes('...(open.length ? { open } : {}),'));
  const ifAt = gate.indexOf('if (!changed.length) {');
  const branch = gate.slice(ifAt, gate.indexOf('break;', ifAt));
  assert.ok(branch.includes("if (open.length) log2(`Ön izleme kapandı (tur ${round}): ${open.length} bulgu düzeltilemedi, render'a böyle gidiyor — ${findingList(open)}`);"));
  assert.ok(branch.includes("else log2(`Ön izleme temiz (tur ${round})"), '"temiz" yalnızca açık bulgu yokken');
  assert.equal((src.match(/Ön izleme temiz \(tur/g) || []).length, 1);
  assert.ok(gate.includes('if (gateOpen.length) quality.push(`Ön izleme kapısı ${gateOpen.length} bulguyu düzeltemedi: ${findingList(gateOpen)}`);'), 'kalite uyarısı (kayıttan: devam eden iş de söyler)');
  assert.ok(src.includes('${open ? `, ${open} bulgu düzeltilemedi` : ""}'), 'render öncesi "Tek render" satırı da söyler');
});

test('2. tur artıkları: yazar okuma hızını bilir (R2), kaynak videonun hatasında ödenen çağrılar hemen kaydedilir (R3)', () => {
  assert.match(src, /docu = await runDocuScript\(job, research, usage, log2, \{[^\n]*voiceSpeed: settings\.docuVoiceSpeed[^\n]*\}\);/);
  const ds = fs.readFileSync(new URL('../src/pipeline/docu-script.js', import.meta.url), 'utf8');
  const sig = ds.slice(ds.indexOf('export async function runDocuScript(job, research, usage, logFn, opts = {})'));
  assert.match(sig.slice(0, 1500), /^\s*const \{.*\bvoiceSpeed\b.*\} = opts;$/m, 'seçeneğin adı docu-script.js ile aynı');
  const at = src.indexOf('const src = await attachSourceClips(');
  const c = src.slice(src.indexOf('} catch (e) {', at), src.indexOf('// Arşivde karşılanmayan', at));
  assert.ok(c.includes('saveUsage();') && c.indexOf('saveUsage();') < c.indexOf('if (isCancelled()) return null;'), 'iptalde de önce kayıt');
});
