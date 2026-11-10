// MOTORUN BEKLEDİĞİ HİÇBİR ffmpeg SÜRESİZ DEĞİL; ANA RENDER'IN TARAYICISI DA 25 SN'DE DÜŞMEZ.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması 20261024-373aaf, takılma analizi): motorun eşzamanlı
// ffmpeg çağrılarının (spawnSync / execFileSync: puan vuruşları, ses ölçümü, mastering, ses parçalarının
// birleştirilmesi, sessizlik taraması, anlatım zinciri, müzik miksi) hiçbirinde süre sınırı yoktu. Takılan bir
// ffmpeg bütün motoru durdurur; iş ancak Nova'nın 25 dakikalık takılma bekçisi motoru öldürünce, neyin
// takıldığını söylemeden düşerdi. Aynı gün kapak çizicisinin tarayıcısı Remotion'ın sabit 25 sn bağlanma
// beklemesinde düştü (16:45:01Z); ana render'ın selectComposition / renderMedia tarayıcıları da aynı 25 sn ile
// açılıyordu.
//
// DÜZELTME (docu-engine/lib/produce.mjs, pace.mjs, sound-craft.mjs, audio-director.mjs): her çağrıya işine göre
// süre (yoklama 60 sn, kısa dosya 180 sn, uzun geçiş 180 sn + kendi süresi, en çok 20 dk), windowsHide ve
// -nostdin. Süresi dolan çalıştırma "ffmpeg N sn içinde bitmedi, durduruldu" diye düşer; yarım çıktısı ölçüm
// sayılmaz ve önbelleğe yazılmaz (sessizlik taraması .sil.json'a, efekt zarfı yan dosyaya / levels.json'a);
// anlatım zinciri takılmayı 4 kez yeniden denemez. render() Remotion'ı aldıktan hemen sonra
// thumbnail.mjs'nin raiseBrowserConnectTimeout'unu çağırır (90 sn).
// Alt süreç, ağ, ffmpeg, tarayıcı YOK: child_process kaydeden sahteyle değiştirilir.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const calls = [];
// Varsayılan: ffmpeg başarıyla biter; çıktısı ".tmp" dosyasıysa yazılmış sayılır.
const ok = (c) => {
  const out = c.args.at(-1);
  if (typeof out === 'string' && /\.tmp/.test(out)) fs.writeFileSync(out, 'x');
  return { status: 0, signal: null, stdout: c.opts?.encoding === 'buffer' || !c.opts?.encoding ? Buffer.alloc(0) : '', stderr: '' };
};
// Node'un spawnSync'i süre dolunca: süreci öldürür, status null, error.code ETIMEDOUT.
const hung = (c, stderr = '') => ({ status: null, signal: 'SIGTERM', stdout: '', stderr, error: Object.assign(new Error(`spawnSync ${c.file} ETIMEDOUT`), { code: 'ETIMEDOUT' }) });
let reply = ok;

const cp = createRequire(import.meta.url)('node:child_process');
cp.spawnSync = (file, args = [], opts = {}) => {
  const c = { kind: 'spawnSync', file, args, opts };
  calls.push(c);
  return reply(c);
};
cp.execFileSync = (file, args = [], opts = {}) => {
  const c = { kind: 'execFileSync', file, args, opts };
  calls.push(c);
  const r = reply(c);
  if (r.error) throw Object.assign(r.error, { status: r.status, signal: r.signal, stderr: r.stderr });
  if (r.status !== 0) throw new Error(`Command failed: ${file}`);
  return r.stdout;
};
for (const f of ['spawn', 'exec', 'execSync', 'execFile', 'fork']) cp[f] = () => { throw new Error(`alt süreç yasak: ${f}`); };
syncBuiltinESMExports();
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const P = await import('../docu-engine/lib/produce.mjs');
const SC = await import('../docu-engine/lib/sound-craft.mjs');
const AD = await import('../docu-engine/lib/audio-director.mjs');
const PACE = await import('../docu-engine/lib/pace.mjs');

const LIB = fileURLToPath(new URL('../docu-engine/lib/', import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ffmpeg-sure-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const take = () => calls.splice(0);
const ffmpegOnly = (cs) => cs.filter((c) => c.file !== process.execPath);
function guarded(c, ms, what) {
  assert.equal(c.opts.timeout, ms, `${what}: süre sınırı ${ms / 1000} sn`);
  assert.equal(c.opts.windowsHide, true, `${what}: pencere gizli`);
  assert.equal(c.args[0], '-nostdin', `${what}: ffmpeg konsoldan girdi beklemez`);
}

test('kısa dosyalar 180 sn: sessizlik taraması, ses ölçümü, anlatım zinciri', () => {
  reply = ok;
  take();
  PACE.detectSilences('ffmpeg', path.join(TMP, 'line.mp3'), 4);
  SC.measure('ffmpeg', path.join(TMP, 'line.mp3'));
  SC.processVoice({ bin: 'ffmpeg', src: path.join(TMP, 'line.mp3'), dst: path.join(TMP, 'voice', 'line.wav') });
  const cs = take();
  assert.equal(cs.length, 5, 'tarama + ölçüm + (ölçüm, ölçüm, kodlama)');
  cs.forEach((c, i) => guarded(c, 180_000, `çağrı ${i + 1}`));
});

test('uzun geçişler süresiyle büyür, 20 dakikayı geçmez: mastering, vuruşlar, müzik miksi', () => {
  assert.equal(P.ffDeadline(720), 900_000, '12 dk video: 180 + 720 sn');
  assert.equal(P.ffDeadline(3 * 3600), 20 * 60_000, 'tavan 20 dk (25 dk bekçinin içinde)');
  assert.equal(P.ffDeadline(null), 20 * 60_000, 'süre bilinmiyorsa en uzunu');

  reply = ok;
  take();
  P.masterAudio({ video: path.join(TMP, 'v.txt'), audio: path.join(TMP, 'mix.wav'), out: path.join(TMP, 'a.mp4'), ffmpeg: 'ffmpeg', seconds: 720 });
  let cs = take();
  assert.equal(cs.length, 4, 'ölçüm, kuru deneme, kodlama, son ölçüm');
  cs.forEach((c, i) => guarded(c, 900_000, `mastering ${i + 1}`));
  P.masterAudio({ video: path.join(TMP, 'v.txt'), audio: path.join(TMP, 'mix.wav'), out: path.join(TMP, 'b.mp4'), ffmpeg: 'ffmpeg' });
  take().forEach((c, i) => guarded(c, 20 * 60_000, `video süresi verilmeyen mastering (render-props) ${i + 1}`));

  P.scoreBeats(path.join(TMP, 'score.wav'), [{ from: 0, to: 300 }, { from: 298.5, to: 600 }], { ff: 'ffmpeg' });
  cs = take();
  assert.equal(cs.length, 1);
  guarded(cs[0], 780_000, 'puanın vuruşları (600 sn)');

  AD.renderScore({
    plan: { cues: [{ fromSec: 0, toSec: 600, trackId: 'm1', startAt: 0, mood: 'calm' }] },
    lib: { music: [{ id: 'm1', file: 'm1.mp3', duration: 300, title: 'T' }], sfx: [] },
    root: TMP, outFile: path.join(TMP, 'score-out.wav'), ff: 'ffmpeg', totalSec: 600,
  });
  cs = take();
  const mix = cs.at(-1);
  assert.ok(mix.args.includes('-map') && mix.args.includes('[out]'), 'son çağrı miks');
  guarded(mix, 780_000, 'müzik miksi (600 sn)');
  assert.ok(cs.length >= 3, 'giriş noktası, seviye ölçümü, miks');
  cs.slice(0, -1).forEach((c, i) => guarded(c, 180_000, `müzik ön çağrısı ${i + 1}`));
});

test('takılan ffmpeg açıkça düşer, yarım çıktısı ölçüm sayılmaz, takılma 4 kez denenmez', () => {
  const isEncode = (c) => c.args.includes('-y');
  // anlatım zinciri: ölçümler biter, kodlama takılır
  reply = (c) => (isEncode(c) ? hung(c) : ok(c));
  take();
  assert.throws(
    () => SC.processVoice({ bin: 'ffmpeg', src: path.join(TMP, 'l2.mp3'), dst: path.join(TMP, 'voice', 'l2.wav') }),
    /anlatım işlenemedi: ffmpeg 180 sn içinde bitmedi, durduruldu/,
  );
  let cs = take();
  assert.equal(ffmpegOnly(cs).filter(isEncode).length, 1, 'takılan kodlama yeniden denenmez (4 x 180 sn sessizlik olurdu)');
  assert.equal(cs.filter((c) => c.file === process.execPath).length, 0, 'bekleme yok');

  // geçici başlatma hatası (antivirüs kilidi): eskisi gibi 4 deneme; aradaki bekleme de süreli ve gizli
  reply = (c) => (isEncode(c) ? { status: 1, stdout: '', stderr: 'Permission denied' } : ok(c));
  assert.throws(() => SC.processVoice({ bin: 'ffmpeg', src: path.join(TMP, 'l3.mp3'), dst: path.join(TMP, 'voice', 'l3.wav') }), /anlatım işlenemedi: Permission denied/);
  cs = take();
  assert.equal(cs.filter(isEncode).length, 4);
  const naps = cs.filter((c) => c.file === process.execPath);
  assert.equal(naps.length, 3);
  for (const c of naps) {
    assert.ok(c.opts.timeout > 0 && c.opts.timeout <= 10_000, 'bekleme süreli');
    assert.equal(c.opts.windowsHide, true);
  }

  // ölçüm: öldürülen çalıştırmanın ilk kareleri dosyanın ölçüsü diye okunmaz
  const frames = '[Parsed_ebur128_1] t: 0.4  TARGET:-23 LUFS    M: -18.2 S:-120.7     I: -21.0 LUFS       LRA:   0.0 LU\n';
  reply = (c) => hung(c, frames);
  assert.throws(() => SC.measure('ffmpeg', path.join(TMP, 'bed.wav')), /ffmpeg 180 sn içinde bitmedi/);
  assert.throws(() => P.masterAudio({ video: 'v.txt', audio: path.join(TMP, 'mix.wav'), out: path.join(TMP, 'c.mp4'), ffmpeg: 'ffmpeg', seconds: 720 }), /ffmpeg 900 sn içinde bitmedi/);
  // sessizlik taraması: öldürülen tarama "sessizlik yok" diye önbelleğe girmez (paceOf yakalar, satır bu sefer yalnız tempoyla)
  reply = (c) => hung(c, '[silencedetect @ 0] silence_start: 0.5\n');
  assert.throws(() => PACE.detectSilences('ffmpeg', path.join(TMP, 'l4.mp3'), 4), /ffmpeg 180 sn içinde bitmedi, durduruldu/);
  reply = () => ({ status: 1, stdout: '', stderr: 'Invalid data found when processing input' });
  assert.deepEqual(PACE.detectSilences('ffmpeg', path.join(TMP, 'l5.mp3'), 4), [], 'başka her hata eskisi gibi boş');
  const paceOf = fs.readFileSync(path.join(LIB, 'produce.mjs'), 'utf8').match(/function paceOf\(l, meta\) \{[\s\S]*?\n {2}\}\n/)?.[0] ?? '';
  assert.match(paceOf, /try \{\s*sil = detectSilences\(.*\);\s*try \{\s*writeAtomic\(silFile, .*\);\s*\} catch \{\}\s*\} catch \(e\) \{[\s\S]*?sil = \[\];\s*\}/, 'paceOf: önbellek yalnız biten taramadan');
  assert.equal(paceOf.match(/writeAtomic\(silFile/g)?.length, 1, 'paceOf: sessizlikler tek yerde, taramanın ardından yazılır');

  // efektin zarfı: öldürülen zarf ölçümünün sıfırları (süre 0) yan dosyaya yazılmaz
  const sfxSrc = path.join(TMP, 'sfx', 'hit-1.wav');
  fs.mkdirSync(path.dirname(sfxSrc), { recursive: true });
  fs.writeFileSync(sfxSrc, 'x');
  const sfxNorm = path.join(TMP, 'sfx-norm');
  const ebur = '[Parsed_ebur128_0] t: 0.4 M: -14.0 S: -120.7 I: -14.0 LUFS\nSummary:\n  I: -16.0 LUFS\n  Peak: -3.0 dBFS\n';
  reply = (c) => (c.args.includes('s16le') ? hung(c) : c.args.some((a) => /ebur128/.test(a)) ? { status: 0, stdout: '', stderr: ebur } : ok(c));
  take();
  assert.throws(
    () => AD.pickSfxPools({ lib: { music: [], sfx: [{ file: 'sfx/hit-1.wav', sourceId: 't:hit', kind: 'hit', slug: 'hit', intensity: 3, genres: ['documentary'], keywords: [] }], sfxRules: null, root: TMP }, root: TMP, genre: 'documentary', seed: 's', ff: 'ffmpeg', cacheDir: sfxNorm }),
    /ffmpeg 180 sn içinde bitmedi, durduruldu/,
  );
  assert.ok(take().some((c) => c.args.includes('s16le')), 'zarf ölçümüne gelindi');
  const sidecars = fs.readdirSync(sfxNorm, { recursive: true }).map(String).filter((f) => f.endsWith('.json'));
  assert.deepEqual(sidecars, [], 'yarım ölçüm yan dosyaya (önbelleğe) yazılmadı');

  // mastering kodlaması takılırsa: mastering başarısız, sebebi yazılı
  reply = (c) => (isEncode(c) ? hung(c) : ok(c));
  assert.throws(() => P.masterAudio({ video: 'v.txt', audio: path.join(TMP, 'mix.wav'), out: path.join(TMP, 'd.mp4'), ffmpeg: 'ffmpeg', seconds: 720 }), /mastering başarısız: ffmpeg 900 sn içinde bitmedi, durduruldu/);
  // puanın vuruşları (execFileSync) ve müzik miksi
  reply = (c) => hung(c);
  assert.throws(() => P.scoreBeats(path.join(TMP, 'score.wav'), [{ from: 0, to: 600 }], { ff: 'ffmpeg' }), /ffmpeg 780 sn içinde bitmedi, durduruldu/);
  reply = (c) => (c.args.includes('[out]') ? hung(c) : ok(c));
  assert.throws(
    () => AD.renderScore({ plan: { cues: [] }, lib: null, outFile: path.join(TMP, 'score-hung.wav'), ff: 'ffmpeg', totalSec: 600 }),
    /müzik miksi başarısız: ffmpeg 780 sn içinde bitmedi, durduruldu/,
  );
  take();
  reply = ok;
});

// Bir çağrının argüman metni: dengeli parantez, dizgiler atlanır.
function callText(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('kapanmayan çağrı');
}
function syncCalls(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.(mjs|js)$/.test(f))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\b(spawnSync|execFileSync|execSync)\s*\(/g)) {
      const line = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index).trim();
      if (/^(\/\/|\*|\/\*)/.test(line) || /^import\b/.test(line)) continue;
      out.push({ file: f, line: src.slice(0, m.index).split('\n').length, fn: m[1], text: callText(src, m.index + m[0].length - 1) });
    }
  }
  return out;
}

test('docu-engine/lib: hiçbir eşzamanlı alt süreç süresiz, pencereli ya da konsola bağlı değil', () => {
  const found = syncCalls(LIB);
  for (const f of ['produce.mjs', 'pace.mjs', 'sound-craft.mjs', 'audio-director.mjs']) assert.ok(found.some((c) => c.file === f), `${f} tarandı`);
  for (const c of found) {
    const where = `${c.file}:${c.line} ${c.fn}`;
    assert.match(c.text, /(^|[{,\s])timeout\s*[:,}]/, `${where} süre sınırı yok`);
    assert.match(c.text, /windowsHide:\s*true/, `${where} pencere gizli değil`);
    if (!/^\(\s*process\.execPath\b/.test(c.text)) assert.ok(c.text.includes("'-nostdin'"), `${where} ffmpeg -nostdin almıyor`);
  }
});

test('ana render: selectComposition / renderMedia tarayıcıları Remotion alınır alınmaz 90 sn bekleme alır', () => {
  const src = fs.readFileSync(path.join(LIB, 'produce.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export async function render('));
  const imp = body.indexOf("await import('@remotion/renderer')");
  const hook = body.indexOf('raiseBrowserConnectTimeout(renderer)');
  assert.ok(imp > 0, 'Remotion render içinde alınıyor');
  assert.ok(hook > imp, 'kanca Remotion alındıktan sonra');
  assert.ok(hook < body.indexOf('selectComposition({') && hook < body.indexOf('renderMedia({'), 'kanca ilk tarayıcı açılmadan önce');
  assert.match(body, /const renderer = await import\('@remotion\/renderer'\);/, 'kanca modülün kendisine takılır');
  assert.match(body.slice(imp, hook), /const \{ raiseBrowserConnectTimeout \} = await import\('\.\/thumbnail\.mjs'\);/);
  assert.match(fs.readFileSync(path.join(LIB, 'thumbnail.mjs'), 'utf8'), /export function raiseBrowserConnectTimeout\(renderer, ms = BROWSER_CONNECT_MS\)/);
});
