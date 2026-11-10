// KAPAK ÇİZİCİNİN SÖZÜ HER DURUMDA BİR KEZ BAĞLANIR (docu-package.js renderWithEngine).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması 20261024-373aaf): ön izleme kapısının 2. turu "her sahnenin karesi
// çiziliyor" adımında 48 dk durdu (hang-373aaf, aday 4). renderWithEngine yalnızca 'close'u bekliyordu; 'close' bütün
// boruların kapanmasını ister, borunun ucunu miras alan bir torun (Remotion'ın Chrome'u) yaşarsa hiç gelmez. Takılma
// bekçisi de yalnızca doğrudan çocuğu (p.kill) öldürüyordu: Chrome yaşamaya, söz beklemeye devam ederdi. logFn
// fırlatırsa (job.json EPERM → updateJob) hata stdout dinleyicisinden ana sürece düşüyordu.
//
// DÜZELTME: tek `settled` bekçisi; 'exit'ten exitGraceMs sonra 'close' yoksa borular kapatılıp sonuç verilir; takılmada
// bütün ağaç kesilir (win32: taskkill /T /F) ve söz doğrudan reddedilir; logFn try/catch içinde.
// Gerçek süreç, tarayıcı, ağ YOK: spawn sahte, çocuk sahte bir EventEmitter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapak-bekleme-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

// Yalnızca kapak çizici ve taskkill sahte olarak "başlar"; başka her süreç patlar. Eski kod da bu sahteyi kullanır
// (canlı bağ), gerçek motor/Chrome/taskkill asla açılmaz.
const cp = createRequire(import.meta.url)('node:child_process');
const spawned = [];
let current = null;
cp.spawn = (cmd, args = []) => {
  spawned.push({ cmd, args });
  if (cmd === 'taskkill') return Object.assign(new EventEmitter(), { pid: undefined, kill() {} });
  if (String(args[0] || '').endsWith('nova-thumbs.mjs')) return current;
  throw new Error(`alt süreç yasak: ${cmd}`);
};
for (const f of ['spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[f] = () => { throw new Error(`alt süreç yasak: ${f}`); };
syncBuiltinESMExports();

const { renderWithEngine } = await import('../src/pipeline/docu-package.js');

// Tek sayılı PID: Windows PID'leri 4'ün katı, Linux/mac pid_max'ın çok üstünde — os.setPriority gerçek sürece dokunmaz.
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

function start(o = {}) {
  current = new FakeChild();
  spawned.length = 0;
  const workDir = fs.mkdtempSync(path.join(home, 'w-'));
  const child = current;
  const p = renderWithEngine({ items: [{ out: path.join(workDir, 'a.jpg') }], assets: {}, workDir, logFn: () => {}, ...o });
  return { child, p };
}
const treeKills = () => spawned.filter((s) => s.cmd === 'taskkill');

test("normal: 'close' gelince dosyalar döner (davranış aynı)", async () => {
  const logs = [];
  const { child, p } = start({ logFn: (m) => logs.push(m) });
  child.line({ type: 'log', msg: 'kare 1/1' });
  child.line({ type: 'done', files: ['a.jpg'], failed: [] });
  await later(10);
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
  const r = await within(p, 2000, 'normal çizim');
  assert.ok(r.ok, r.e?.message);
  assert.deepEqual(r.v, { files: ['a.jpg'], failed: [] });
  assert.deepEqual(logs, ['kare 1/1']);
  assert.equal(treeKills().length, 0);
  assert.deepEqual(child.kills, []);
});

test("torun boruyu tutarsa: 'exit'ten sonra 'close' gelmese de söz bağlanır, borular kapatılır", async () => {
  const { child, p } = start({ exitGraceMs: 60 });
  child.line({ type: 'done', files: ['a.jpg'], failed: [] });
  await later(10);
  child.emit('exit', 0, null); // 'close' hiç gelmiyor: Chrome stdout'u açık tutuyor
  const r = await within(p, 2000, "exit sonrası 'close' yok");
  assert.ok(r.ok, r.e?.message);
  assert.deepEqual(r.v.files, ['a.jpg']);
  assert.ok(child.stdout.destroyed && child.stderr.destroyed, 'borular kapatılmalı');
  child.emit('close', 0, null); // geç gelen 'close' ikinci kez bağlamaz, patlamaz
});

test("hata koduyla 'exit' ve 'close' yok: söz askıda kalmaz, hatayla düşer", async () => {
  const { child, p } = start({ exitGraceMs: 60 });
  child.stderr.write('Error: tarayıcı çöktü\n');
  child.line({ type: 'error', msg: 'kapak çizilemedi' });
  await later(10);
  child.emit('exit', 1, null);
  const r = await within(p, 2000, "hatalı exit sonrası 'close' yok");
  assert.equal(r.ok, false);
  assert.match(r.e.message, /^kapak çizici: kapak çizilemedi/);
});

test('takılma: bütün ağaç kesilir ve söz çocuk çıkmasa da doğrudan reddedilir', async () => {
  const { child, p } = start({ stallMs: 50 });
  // Çocuk hiç 'exit'/'close' vermiyor (Chrome'u bekleyen donmuş motor).
  const r = await within(p, 2000, 'takılan çizici');
  assert.equal(r.ok, false);
  assert.match(r.e.message, /kapak çizici: .*yanıt vermedi ve durduruldu/);
  assert.deepEqual(child.kills, ['SIGKILL']);
  if (process.platform === 'win32') {
    assert.deepEqual(treeKills().map((s) => s.args), [['/pid', String(PID), '/T', '/F']], 'Windows: taskkill /T /F ile ağaç');
  }
  // Bağlandıktan sonra gelen veri bekçiyi yeniden kurmaz: ikinci bir ağaç kesimi yok.
  child.stdout.write('{"type":"log","msg":"geç"}\n');
  child.stderr.write('geç\n');
  await later(120);
  assert.equal(child.kills.length, 1);
  assert.ok(treeKills().length <= 1);
});

test("çocuk çıktıktan sonra gelen veri bekçiyi kurmaz (ölü PID'nin ağacı kesilmez)", async () => {
  const { child, p } = start({ stallMs: 30, exitGraceMs: 150 });
  child.line({ type: 'done', files: ['a.jpg'], failed: [] });
  await later(5);
  child.emit('exit', 0, null);
  for (const ms of [10, 20, 20]) { await later(ms); child.stderr.write('torun hâlâ yazıyor\n'); }
  const r = await within(p, 2000, "exit sonrası 'close' yok");
  assert.ok(r.ok, r.e?.message);
  assert.deepEqual(child.kills, [], 'çıkmış çocuk öldürülmez');
  assert.equal(treeKills().length, 0, "çıkmış çocuğun PID'sine taskkill yok");
});

test('logFn fırlatsa da dinleyici düşmez, sonraki olaylar işlenir', async () => {
  const uncaught = [];
  const h = (e) => uncaught.push(e);
  process.on('uncaughtException', h);
  try {
    const { child, p } = start({ logFn: () => { throw Object.assign(new Error('EPERM: operation not permitted, rename job.json'), { code: 'EPERM' }); } });
    // Aynı parçada log + done: eski kodda log fırlatınca done satırı hiç işlenmiyordu.
    child.stdout.write('{"type":"log","msg":"kare 1/1"}\n{"type":"done","files":["a.jpg"],"failed":[]}\n');
    await later(20);
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
    const r = await within(p, 2000, 'fırlatan logFn');
    assert.ok(r.ok, r.e?.message);
    assert.deepEqual(r.v.files, ['a.jpg']);
    await later(10);
    assert.deepEqual(uncaught.map((e) => e.message), []);
  } finally {
    process.off('uncaughtException', h);
  }
});

test("'error' sonra 'close': tek bağlanma, ilk hata döner", async () => {
  const { child, p } = start();
  child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }));
  child.emit('close', -4092, null);
  const r = await within(p, 2000, 'spawn hatası');
  assert.equal(r.ok, false);
  assert.equal(r.e.message, 'spawn EACCES');
});
