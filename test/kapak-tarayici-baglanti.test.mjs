// KAPAK ÇİZİCİNİN TARAYICISI YÜK ALTINDA 25 SN'DE AÇILAMAYINCA KAPI DÜŞMEZ.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması 20261024-373aaf): job.log 2026-10-25T16:45:01Z "Ön izleme teknik
// hatayla durdu (kapak çizici: Timed out after 25000 ms while trying to connect to the browser! Chrome logged the
// following: ); kapı bir kez daha deneniyor". Isı koruması Nova'nın süreçlerini (chrome-headless-shell dahil) 12
// iş parçacığının 8'ine ve BelowNormal önceliğe sabitliyor; kareler çizilirken başsız tarayıcının açılışı 25 sn'yi
// aşabiliyor. 25 sn Remotion'ın openBrowser() içinde sabit (seçenek yok); hata bütün ön izleme kapısını düşürüyordu.
//
// DÜZELTME (docu-engine/lib/thumbnail.mjs): bağlanma beklemesi Remotion'ın başlatıcısının tek çağrısında
// (RenderInternals.HeadlessBrowser.create) 90 sn'ye çıkarılır; tarayıcının AÇILIŞI (kapının tamamı değil) bir kez
// sessizce yeniden denenir; bir çağrının bütün kareleri yine tek tarayıcıyla çizilir.
// Ağ, model, tarayıcı ve alt süreç YOK: Remotion sahte; gerçek Remotion yalnızca biçimi için yüklenir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Bu test hiçbir süreç başlatamaz (Chrome, ffmpeg, motor): denerse patlar.
const cp = createRequire(import.meta.url)('node:child_process');
for (const f of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[f] = () => { throw new Error(`alt süreç yasak: ${f}`); };
syncBuiltinESMExports();
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const T = await import('../docu-engine/lib/thumbnail.mjs');
const THUMB = fileURLToPath(new URL('../docu-engine/lib/thumbnail.mjs', import.meta.url));

// Remotion'ın yolu: openBrowser → launchChrome → HeadlessBrowser.create({ timeout: 25000, ... }).
function fakeRenderer({ fails = 0, message = 'Timed out after 25000 ms while trying to connect to the browser! Chrome logged the following: ' } = {}) {
  const seen = [];
  class HeadlessBrowser {
    static async create(o) {
      seen.push(o);
      if (seen.length <= fails) throw new Error(message);
      return { id: `b${seen.length}`, close: async () => {} };
    }
  }
  const renderer = {
    RenderInternals: { HeadlessBrowser },
    openBrowser: async (kind, opts) => {
      assert.equal(kind, 'chrome');
      assert.deepEqual(opts.chromiumOptions, { gl: 'angle' }, 'çizimin seçenekleri aynen geçer');
      return HeadlessBrowser.create({ timeout: 25000, userDataDir: 'C:/tmp/puppeteer_dev_chrome_profile-x', args: ['about:blank'] });
    },
  };
  return { renderer, seen };
}

test('bağlanma beklemesi 25 sn değil 90 sn; başlatıcının öbür ayarları aynen geçer', async () => {
  const { renderer, seen } = fakeRenderer();
  const b = await T.openCoverBrowser(renderer, { chromiumOptions: { gl: 'angle' }, retryWaitMs: 0 });
  assert.equal(b.id, 'b1');
  assert.equal(seen.length, 1, 'normal durumda tek açılış');
  assert.equal(T.BROWSER_CONNECT_MS, 90_000);
  assert.equal(seen[0].timeout, 90_000);
  assert.equal(seen[0].userDataDir, 'C:/tmp/puppeteer_dev_chrome_profile-x');
  assert.deepEqual(seen[0].args, ['about:blank']);
});

test('ilk açılış zaman aşımına düşerse açılış bir kez sessizce yeniden denenir, kapı düşmez', async () => {
  const { renderer, seen } = fakeRenderer({ fails: 1 });
  const logs = [];
  const b = await T.openCoverBrowser(renderer, { chromiumOptions: { gl: 'angle' }, log: (m) => logs.push(m), retryWaitMs: 0 });
  assert.equal(b.id, 'b2', 'ikinci açılışın tarayıcısı');
  assert.equal(seen.length, 2);
  assert.ok(seen.every((o) => o.timeout === 90_000), 'yeniden denemede de 90 sn');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /kapak tarayıcısı açılamadı \(Timed out after 25000 ms.*\); bir kez daha deneniyor/);
});

test('yalnızca BİR yeniden deneme: iki açılış da düşerse son hata olduğu gibi çıkar (sonsuz döngü yok)', async () => {
  const { renderer, seen } = fakeRenderer({ fails: 5, message: 'Failed to launch the browser process!' });
  await assert.rejects(T.openCoverBrowser(renderer, { chromiumOptions: { gl: 'angle' }, retryWaitMs: 0 }), /Failed to launch the browser process!/);
  assert.equal(seen.length, 2);
});

test('iptal edilmişse yeniden denenmez', async () => {
  const { renderer, seen } = fakeRenderer({ fails: 1 });
  await assert.rejects(
    T.openCoverBrowser(renderer, { chromiumOptions: { gl: 'angle' }, cancelled: () => true, retryWaitMs: 0 }),
    (e) => e.cancelled === true,
  );
  assert.equal(seen.length, 1);
});

test('kanca bir kez takılır; daha uzun ya da sınırsız (0 / verilmemiş) bekleme kısaltılmaz; kancasız Remotion yine açılır', async () => {
  const { renderer, seen } = fakeRenderer();
  const HB = renderer.RenderInternals.HeadlessBrowser;
  assert.equal(T.raiseBrowserConnectTimeout(renderer), true);
  const hooked = HB.create;
  assert.equal(T.raiseBrowserConnectTimeout(renderer), true);
  assert.equal(HB.create, hooked, 'iki kez sarılmaz');
  await HB.create({ timeout: 120_000 });
  await HB.create({ timeout: 0 });
  await HB.create({ timeout: 25000 });
  // Remotion'ın waitForWSEndpoint'i: `timeout ? setTimeout(...) : 0` — verilmemiş bekleme de sınırsız, 90 sn'ye inmez
  await HB.create({});
  assert.deepEqual(seen.map((o) => o.timeout), [120_000, 0, 90_000, undefined]);

  const bare = { openBrowser: async () => ({ id: 'plain' }) };
  assert.equal(T.raiseBrowserConnectTimeout(bare), false);
  assert.equal((await T.openCoverBrowser(bare, { retryWaitMs: 0 })).id, 'plain');
});

test('çizici tarayıcıyı bu yoldan ve bir kez açar: her çağrının bütün kareleri tek tarayıcıda', () => {
  const src = fs.readFileSync(THUMB, 'utf8');
  const body = src.slice(src.indexOf('export async function renderThumbnails'));
  assert.equal((body.match(/openCoverBrowser\(/g) || []).length, 1);
  assert.ok(!/\bopenBrowser\(/.test(body), 'doğrudan openBrowser() 25 sn ile açardı');
  assert.ok(/puppeteerInstance: browser/.test(body), 'kareler açılan tarayıcıyı kullanır');
});

// Kurulu Remotion'da kanca gerçekten var mı: yoksa bekleme sessizce 25 sn'de kalırdı.
const req = createRequire(THUMB);
let rDir = null;
try { rDir = path.dirname(req.resolve('@remotion/renderer/package.json')); } catch {}
test('kurulu Remotion: başlatıcı HeadlessBrowser.create çağırıyor, kanca ona takılıyor', { skip: !rDir && 'motorun node_modules\'u kurulu değil' }, async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rDir, 'package.json'), 'utf8'));
  const esm = path.join(rDir, pkg.exports['.'].import);
  const bundle = fs.readFileSync(esm, 'utf8');
  const launcher = bundle.slice(bundle.indexOf('var launchChrome = async'), bundle.indexOf('var launchChrome = async') + 600);
  assert.ok(launcher.includes('await HeadlessBrowser.create({'), 'launchChrome tarayıcıyı HeadlessBrowser.create ile açıyor');
  const R = await import(pathToFileURL(esm).href);
  const HB = R.RenderInternals.HeadlessBrowser;
  const original = HB.create;
  assert.equal(typeof original, 'function');
  assert.equal(T.raiseBrowserConnectTimeout(R), true);
  assert.notEqual(HB.create, original, 'statik create sarıldı (launchChrome onu çağırır)');
});
