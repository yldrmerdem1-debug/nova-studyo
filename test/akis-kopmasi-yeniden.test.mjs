// YANIT ORTASINDA KOPAN BAĞLANTI İŞİ ÖLDÜRMEZ.
//
// ÖLÇÜLEN KUSUR (denizaltı 20261024-373aaf, 19:03:35 "Web araştırması yapılıyor..." → 19:05:55 "HATA: terminated";
// 20261003-214ff7 bölüm 6'da aynı): 32k tavanlı araştırma/bölüm çağrısı akışla gidiyor; akış ortada kopunca undici
// durumsuz bir TypeError('terminated') atıyor. SDK'nın denemeleri yalnızca yanıt başlamadan önceki hataları kapsıyor,
// createMessage yalnızca yoğunlukta model değiştiriyordu → iş otomatik denemesiz hataya düştü, araştırma parası boşa.
// Artık aynı model 5 sn / 20 sn sonra yeniden sorulur, yine koparsa zincir sıradaki modele geçer; HTTP hataları
// (400 vb.) hiç yeniden denenmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-akis-kopmasi-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { retryTransient, isTransientNet } = await import('../src/llm.js');

const ok = { model: 'offline', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } };

test('hangi hatalar geçici bağlantı kopması sayılır', () => {
  assert.equal(isTransientNet(new TypeError('terminated')), true);
  assert.equal(isTransientNet(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })), true);
  assert.equal(isTransientNet(Object.assign(new Error('Connection error.'), { cause: new Error('other side closed') })), true);
  assert.equal(isTransientNet(new Error('socket hang up')), true);
  assert.equal(isTransientNet(Object.assign(new Error('terminated'), { status: 400 })), false, 'HTTP durumu olan hata istekle ilgilidir');
  assert.equal(isTransientNet(Object.assign(new Error('Overloaded'), { status: 529 })), false, 'yoğunluk model zincirinin işi');
  assert.equal(isTransientNet(new Error('Request timed out.')), false, '10 dakikalık SDK zaman aşımı yeniden ödenmez');
  assert.equal(isTransientNet(new Error('cancelled')), false);
  assert.equal(isTransientNet(Object.assign(new Error('Schema is too complex: yanıt 90 sn içinde başlamadı'), { schemaStall: true })), false);
});

test('akış bir kez kopar: aynı istek yeniden gider, sonuç döner, günlükte görünür', async () => {
  let n = 0; const logs = [];
  const out = await retryTransient(async () => { if (++n === 1) throw new TypeError('terminated'); return ok; }, { logFn: (m) => logs.push(m), label: 'claude-opus-5-5', waits: [1, 1] });
  assert.equal(out.content[0].text, 'ok');
  assert.equal(n, 2);
  assert.match(logs[0], /claude-opus-5-5: bağlantı koptu \(terminated\), yeniden deneniyor \(1\/2\)/);
});

test('400 asla yeniden denenmez; sürekli kopan bağlantı 1+2 denemeden sonra hatayı verir', async () => {
  let n = 0;
  await assert.rejects(retryTransient(async () => { n++; throw Object.assign(new Error('invalid_request_error'), { status: 400 }); }, { waits: [1, 1] }), /invalid_request_error/);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(retryTransient(async () => { n++; throw new TypeError('terminated'); }, { waits: [1, 1] }), /terminated/);
  assert.equal(n, 3);
});

test('iptal edilmiş iş yeniden denenmez', async () => {
  let n = 0, cancelled = false;
  await assert.rejects(retryTransient(async () => { n++; cancelled = true; throw new TypeError('terminated'); }, { control: { isCancelled: () => cancelled }, waits: [1, 1] }), /cancelled/);
  assert.equal(n, 1);
});

test('bağlantı: her Claude isteği (araştırma, bölüm, yönetmenler) createMessage içinde bu denemeden geçer', () => {
  const src = fs.readFileSync(new URL('../src/llm.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('async function createMessage('), src.indexOf('function textOf('));
  assert.match(body, /retryTransient\(\(\) => callModel\(getClient\(\), chain\[i\], params, control\)/);
  assert.match(body, /isOverload\(e\) \|\| e\?\.fallback \|\| isTransientNet\(e\)/, 'yeniden denemeler de koparsa sıradaki model');
  assert.match(src, /waits = \[5000, 20000\]/);
});
