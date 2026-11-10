// SİNEMATİK MOTORUN SÖZÜ HER DURUMDA BİR KEZ BAĞLANIR, DİNLEYİCİSİNDEN HATA FIRLAMAZ (docu.js runDocuEngine).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması 20261024-373aaf, ön izleme kapısının 2. turu 48 dk dondu): motorun
// ilerleme satırı onProgress → updateJob → writeJson'un rename'i EPERM verdi (dışarıdan bir okuyucu job.json'u tutuyordu);
// hata motorun stdout 'data' dinleyicisinden ana sürecin uncaughtException'ına düştü, oradaki eşzamanlı pencere Node'u
// durdurdu. Kapının hazırlığı her %0,1'lik satırda job.json'u yeniden yazıyordu (fsync + rename): kilide çarpma şansı
// binlerce kez. Ayrıca söz yalnızca 'close'u bekliyordu (borunun ucunu tutan torun Chrome/ffmpeg kalırsa hiç gelmez) ve
// takılma bekçisi ağacı kesip yine 'close'u bekliyordu; taskkill açılamazsa 'error' olayı dinleyicisiz kalıyordu.
//
// DÜZELTME: onLog/onProgress/onActivity try/catch içinde; tek `settled` bekçisi; 'exit'ten exitGraceMs sonra 'close' yoksa
// borular kapatılıp sonuç verilir; takılmada bütün ağaç (taskkill /T /F) kesilir ve söz doğrudan reddedilir; taskkill'in
// 'error'u dinlenir. İş kaydı yalnızca görünen ilerleme değişince yazılır (engineProgress).
// Gerçek süreç, motor, ağ YOK: spawn sahte, çocuk sahte bir EventEmitter (kapak-cizici-bekleme.test.mjs ile aynı düzen).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-motor-bekleme-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

// Yalnızca motor ve taskkill sahte olarak "başlar"; başka her süreç patlar. Eski kod da bu sahteyi kullanır (canlı bağ).
const cp = createRequire(import.meta.url)('node:child_process');
const spawned = [];
let current = null;
cp.spawn = (cmd, args = []) => {
  if (cmd === 'taskkill') { const tk = Object.assign(new EventEmitter(), { pid: undefined, kill() {} }); spawned.push({ cmd, args, tk }); return tk; }
  spawned.push({ cmd, args });
  if (String(args[0] || '').endsWith('nova-run.mjs')) return current;
  throw new Error(`alt süreç yasak: ${cmd}`);
};
for (const f of ['spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[f] = () => { throw new Error(`alt süreç yasak: ${f}`); };
syncBuiltinESMExports();

const D = await import('../src/pipeline/docu.js');

// Tek sayılı PID: Windows PID'leri 4'ün katı — sahte taskkill zaten hiçbir sürece dokunmaz.
const PID = 999999999;
class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.pid = PID;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.kills = [];
  }
  kill(sig) { this.kills.push(sig); return true; }
  line(o) { this.stdout.write(JSON.stringify(o) + '\n'); }
}

const later = (ms) => new Promise((r) => setTimeout(r, ms));
/** Söz `ms` içinde bağlanmazsa test düşer (eski kod sonsuza dek beklerdi); ref'li zamanlayıcı döngüyü de canlı tutar. */
function within(promise, ms, what) {
  let t;
  return Promise.race([
    promise.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: ${ms} ms içinde bağlanmadı (askıda)`)), ms); }),
  ]).finally(() => clearTimeout(t));
}
const EPERM = () => Object.assign(new Error('EPERM: operation not permitted, rename job.json.tmp -> job.json'), { code: 'EPERM' });

function start(o = {}) {
  current = new FakeChild();
  spawned.length = 0;
  const workDir = fs.mkdtempSync(path.join(home, 'w-'));
  const child = current;
  const p = D.runDocuEngine({ scriptPath: path.join(workDir, 's.json'), workDir, output: path.join(workDir, 'o.mp4'), settings: { elevenKey: 'e' }, ...o });
  return { child, p };
}
const treeKills = () => spawned.filter((s) => s.cmd === 'taskkill');
/** Dinleyiciden fırlayan hata: eşzamanlıysa write'tan, değilse uncaughtException olarak gelir — ikisi de yakalanır. */
async function catching(fn) {
  const uncaught = [];
  const h = (e) => uncaught.push(e);
  process.on('uncaughtException', h);
  try {
    try { await fn(); } catch (e) { uncaught.push(e); }
    await later(20);
  } finally {
    process.off('uncaughtException', h);
  }
  return uncaught.map((e) => e.message);
}

test("normal: olaylar akar, 'close' gelince 'done' döner (davranış aynı)", async () => {
  const logs = [], progress = [], seen = [];
  const { child, p } = start({ onLog: (m) => logs.push(m), onProgress: (s, x) => progress.push([s, x]), onActivity: () => seen.push(1) });
  child.line({ type: 'log', msg: 'görsel: test' });
  child.stdout.write('Downloading from: https://example\n');
  child.line({ type: 'progress', stage: 'images', pct: 20 });
  child.line({ type: 'done', durationSec: 12.5 });
  await later(10);
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  const r = await within(p, 2000, 'normal motor');
  assert.ok(r.ok, r.e?.message);
  assert.equal(r.v.durationSec, 12.5);
  assert.deepEqual(logs, ['görsel: test', 'Downloading from: https://example']);
  assert.deepEqual(progress, [['images', 20]]);
  assert.ok(seen.length >= 1, 'her çıktı parçası bekçiye ilerleme sayılır');
  assert.equal(treeKills().length, 0);
  assert.deepEqual(child.kills, []);
});

test('onProgress/onLog fırlatsa (job.json EPERM) hata dinleyiciden ana sürece düşmez; aynı parçadaki "done" yine işlenir', async () => {
  let r;
  const escaped = await catching(async () => {
    const { child, p } = start({ onLog: () => { throw EPERM(); }, onProgress: () => { throw EPERM(); }, onActivity: () => { throw EPERM(); } });
    // Aynı parçada ilerleme + günlük + done: eski kodda ilk satır fırlatınca "done" bu parçada hiç işlenmiyordu.
    child.stdout.write('{"type":"progress","stage":"images","pct":0.1}\n{"type":"log","msg":"görsel 1/40"}\nnull\n{"type":"done","durationSec":3}\n');
    child.stderr.write('uyarı\n');
    await later(10);
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    r = await within(p, 2000, 'fırlatan geri çağrı');
  });
  assert.deepEqual(escaped, [], 'dinleyiciden hata kaçmamalı');
  assert.ok(r.ok, r.e?.message);
  assert.equal(r.v.durationSec, 3);
});

test("hata yolunda onLog fırlatsa da söz hatayla bağlanır ('close' dinleyicisi düşmez)", async () => {
  let r;
  const escaped = await catching(async () => {
    const { child, p } = start({ onLog: () => { throw EPERM(); } });
    child.stderr.write('Error: Chrome çöktü\n');
    child.line({ type: 'error', msg: 'Remotion: tarayıcı kapandı', stack: 'Error: tarayıcı kapandı\n    at x' });
    await later(10);
    child.emit('exit', 1, null);
    child.emit('close', 1, null);
    r = await within(p, 2000, 'hatalı motor');
  });
  assert.deepEqual(escaped, []);
  assert.equal(r.ok, false);
  assert.match(r.e.message, /^Sinematik motor: Remotion: tarayıcı kapandı/);
});

test("torun boruyu tutarsa: 'exit'ten sonra 'close' gelmese de söz bağlanır, borular kapatılır", async () => {
  const { child, p } = start({ exitGraceMs: 60 });
  child.line({ type: 'done', durationSec: 7 });
  await later(10);
  child.emit('exit', 0, null); // 'close' hiç gelmiyor: Remotion'ın Chrome'u stdout'u açık tutuyor
  const r = await within(p, 2000, "exit sonrası 'close' yok");
  assert.ok(r.ok, r.e?.message);
  assert.equal(r.v.durationSec, 7);
  assert.ok(child.stdout.destroyed && child.stderr.destroyed, 'borular kapatılmalı');
  child.emit('close', 0, null); // geç gelen 'close' ikinci kez bağlamaz, patlamaz
});

test("varsayılan bekleme 15 sn: 'exit'ten hemen sonra 'close' gelirse sonuç beklemeden döner", async () => {
  const src = fs.readFileSync(new URL('../src/pipeline/docu.js', import.meta.url), 'utf8');
  assert.match(src, /export function runDocuEngine\(\{[^)]*exitGraceMs = 15000/);
  const { child, p } = start();
  child.line({ type: 'done', durationSec: 1 });
  await later(5);
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  const r = await within(p, 1000, 'normal kapanış');
  assert.ok(r.ok, r.e?.message);
});

test('takılma: bütün ağaç kesilir ve söz çocuk çıkmasa da doğrudan reddedilir; taskkill hatası ana sürece düşmez', async () => {
  const { child, p } = start({ stallMs: 50 });
  // Çocuk hiç 'exit'/'close' vermiyor (Chrome'u bekleyen donmuş motor).
  const r = await within(p, 2000, 'takılan motor');
  assert.equal(r.ok, false);
  assert.match(r.e.message, /Sinematik motor \d+ dakika yanıt vermedi ve durduruldu.*Kaldığı yerden devam et/);
  assert.deepEqual(child.kills, ['SIGKILL']);
  assert.ok(child.stdout.destroyed && child.stderr.destroyed, 'borular kapatıldı');
  if (process.platform === 'win32') {
    assert.deepEqual(treeKills().map((s) => s.args), [['/pid', String(PID), '/T', '/F']], 'Windows: taskkill /T /F ile ağaç');
    // taskkill açılamadı (PATH bozuk): dinleyicisiz 'error' olayı fırlatırdı → uncaughtException.
    assert.doesNotThrow(() => treeKills()[0].tk.emit('error', Object.assign(new Error('spawn taskkill ENOENT'), { code: 'ENOENT' })));
  }
  // Bağlandıktan sonra gelen veri bekçiyi yeniden kurmaz: ikinci bir ağaç kesimi yok.
  child.stderr.emit('data', 'geç\n');
  child.stdout.emit('data', '{"type":"log","msg":"geç"}\n');
  await later(120);
  assert.equal(child.kills.length, 1);
  assert.ok(treeKills().length <= 1);
});

test('takılan motorun işi bu arada iptal edildiyse söz "cancelled" ile bağlanır (takılma mesajı değil, eskisi gibi)', async () => {
  const killer = { cancelled: false, add() {} };
  const { child, p } = start({ killer, stallMs: 50 });
  killer.cancelled = true;
  const r = await within(p, 2000, 'iptal');
  assert.equal(r.ok, false);
  assert.equal(r.e.message, 'cancelled');
  child.emit('close', null, 'SIGKILL');
});

test("'error' sonra 'close': tek bağlanma, ilk hata döner", async () => {
  const { child, p } = start();
  child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }));
  child.emit('close', -4092, null);
  const r = await within(p, 2000, 'spawn hatası');
  assert.equal(r.ok, false);
  assert.equal(r.e.message, 'spawn EACCES');
});

test('ilerleme yazımı: job.json yalnızca aşama ya da yuvarlanmış yüzde değişince yazılır (her %0,1 değil)', () => {
  const writes = [];
  const prog = D.engineProgress((p) => writes.push(p), { from: 15, span: 20 });
  for (let k = 0; k <= 1000; k++) prog('images', k / 10); // motor %0,0 … %100,0 her %0,1'de
  assert.equal(writes.length, 21, `${writes.length} yazım`);
  assert.deepEqual(writes[0], { stage: 'media', progress: 15 });
  assert.deepEqual(writes.at(-1), { stage: 'media', progress: 35 });
  prog('voice', 100);
  assert.deepEqual(writes.at(-1), { stage: 'voice', progress: 35 }, 'aşama değişince yazılır');
  prog('voice', 100);
  assert.equal(writes.length, 22, 'aynı değer yeniden yazılmaz');
  const prep = [];
  const p2 = D.engineProgress((p) => prep.push(p), { from: 15, span: 70 });
  p2('weird', 50);
  assert.deepEqual(prep, [{ stage: 'media', progress: 50 }], 'tanınmayan aşama "media"');
  // Kapı ve hazırlık modu bu yazıcıyı kullanır; render zaten yalnızca değişince yazıyordu (shown).
  const src = fs.readFileSync(new URL('../src/pipeline/docu.js', import.meta.url), 'utf8');
  assert.ok(src.includes('onProgress: engineProgress((p) => updateJob(jobId, p), { from: 15, span: 20 }),'), 'ön izleme hazırlığı');
  assert.ok(src.includes('onProgress: engineProgress((p) => updateJob(jobId, p), { from: 15, span: 70 }),'), 'hazırlık modu');
  assert.ok(!/onProgress: \(stage, pct\) => updateJob\(jobId/.test(src), 'her satırda updateJob kalmadı');
});
