// OKUNAMAYAN RESİM 400'Ü ŞEMA HATASI SAYILMAZ (25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası 950730 "Could not process image"; Fransa borcu 48ae2d "specified using the
// image/jpeg media type"): structuredRequest her 400'ü "yapılandırılmış çıktı bu çağrıda kullanılamadı" sayıp AYNI
// resimlerle istemli şemaya yeniden soruyordu; ikinci istek de aynı 400'le düşüyordu. Görsel kutusunun aday aday
// yedeği (inbox-commons) böylece her aday için iki istek ödüyordu. Artık resimle ilgili 400 olduğu gibi atılır:
// tek istek, şema kararı da yazılmaz. Şemayla ilgili 400'de istemli yedek eskisi gibi çalışır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gorsel-400-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { callVisionJSON } = await import('../src/llm.js');
const { fillInboxFromCommons } = await import('../src/pipeline/inbox-commons.js');

const STORE = path.join(home, 'data', 'schema-refusals.json');
const reply = (obj) => ({ model: 'offline', usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const err400 = (message) => Object.assign(new Error(`400 {"type":"error","error":{"type":"invalid_request_error","message":${JSON.stringify(message)}}}`), { status: 400 });
const schema = { type: 'object', properties: { pick: { type: 'integer' } }, required: ['pick'], additionalProperties: false };
const images = [{ etiket: 'Picture 1: x.png', data: 'iVBORw0KGgo=', mediaType: 'image/jpeg' }];
const imagesOf = (p) => p.messages[0].content.filter((b) => b.type === 'image');

// Ölçülen ve belgelenen resim hataları (API iletisinin kendisi).
const IMAGE_ERRORS = [
  'Could not process image',
  'messages.0.content.1.image.source.base64: The image was specified using the image/jpeg media type, but the image appears to be a image/png image',
  'messages.0.content.1.image.source.base64: image exceeds 5 MB maximum: 6291456 bytes > 5242880 bytes',
];

for (const message of IMAGE_ERRORS) {
  test(`resim 400'ü tek istekte atılır, istemli şemaya yeniden sorulmaz: ${message.slice(0, 50)}`, async () => {
    fs.rmSync(STORE, { force: true });
    const sent = [], logs = [];
    const request = async (p) => { sent.push(p); throw err400(message); };
    await assert.rejects(callVisionJSON({ user: 'Which picture?', images, schema, request, logFn: (m) => logs.push(m) }), (e) => e.status === 400 && e.message.includes(message));
    assert.equal(sent.length, 1, 'aynı resimler ikinci kez gönderilmez');
    assert.ok(sent[0].output_config, 'ilk istek dilbilgisiyle gitti');
    assert.ok(!logs.some((m) => /Yapılandırılmış çıktı bu çağrıda kullanılamadı/.test(m)), logs.join(' | '));
    assert.equal(fs.existsSync(STORE), false, 'resim hatası şema reddi olarak yazılmaz');
  });
}

test('şemayla ilgili 400 resimli çağrıda da eskisi gibi istemli şemaya düşer; resimler yine gider', async () => {
  fs.rmSync(STORE, { force: true });
  const sent = [];
  const request = async (p) => { sent.push(p); if (p.output_config) throw err400("output_config.format.schema: Invalid schema: Enum value 'x' does not match declared type"); return reply({ pick: 1 }); };
  assert.equal((await callVisionJSON({ user: 'Which picture?', images, schema, request })).pick, 1);
  assert.equal(sent.length, 2);
  assert.ok(sent[0].output_config && !sent[1].output_config);
  assert.equal(imagesOf(sent[1]).length, 1);
  assert.match(sent[1].messages[0].content.at(-1).text, /JSON ŞEMASI \(birebir uygula\)/);
});

test('kredi bitmesi yine tek istekte atılır (değişmedi)', async () => {
  const sent = [];
  const request = async (p) => { sent.push(p); throw err400('Your credit balance is too low to access the Anthropic API.'); };
  await assert.rejects(callVisionJSON({ user: 'x', images, schema, request }), /credit balance is too low/);
  assert.equal(sent.length, 1);
});

// Kablolama: inbox-commons'ın aday aday yedeği gerçek callVisionJSON ile — aday başına bir istek.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const BAD = Buffer.concat([JPEG, Buffer.from('cmyk')]);
const page = (title, date, index) => ({ title: `File:${title}`, index, imageinfo: [{ width: 2400, height: 1600, url: `https://upload.wikimedia.org/o/${index}`, thumburl: `https://upload.wikimedia.org/t/${index}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${index}`, extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Someone' }, ...(date ? { DateTimeOriginal: { value: date } } : {}) } }] });
const PAGES = [page('Kehlsteinhaus cmyk scan.jpg', null, 1), page('Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg', '2004', 2)];
const THUMBS = { 1: BAD, 2: JPEG };
const fetchImpl = async (u) => {
  if (u.startsWith('https://commons.wikimedia.org/w/api.php')) return { ok: true, json: async () => ({ query: { pages: Object.fromEntries(PAGES.map((p, i) => [i + 1, p])) } }) };
  const b = THUMBS[Number(u.split('/').pop())];
  return { ok: !!b, status: b ? 200 : 404, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
};

test('Kartal görsel kutusu: okunamayan aday bütün yedeği iki katına çıkarmaz — 3 istek (ikisi birlikte, sonra tek tek), 5 değil', async () => {
  fs.rmSync(STORE, { force: true });
  const job = fs.mkdtempSync(path.join(home, 'kutu-'));
  fs.mkdirSync(path.join(job, 'gorsel-kutusu'));
  fs.writeFileSync(path.join(job, 'gorsel-kutusu', 'needed.json'), JSON.stringify({ items: [{ n: 2, file: 'build/20261024-950730/img-0151dc1ffedb.jpg', prompt: 'Back view of a stone mountain house among rocks under a pale overcast sky, quiet and empty. Sober documentary photograph.' }] }));
  fs.writeFileSync(path.join(job, 'docu-script.json'), JSON.stringify({ scenes: [{ say: 'Should Bavaria rebuild it as it stood, or leave the ruin on the peak?', imagePrompt: 'Back view of a stone mountain house among rocks under a pale overcast sky, quiet and empty', era: '2026' }] }));
  fs.writeFileSync(path.join(job, 'docu-archive-done.json'), JSON.stringify({ credits: {} }));
  const badB64 = BAD.toString('base64');
  const sent = [];
  const request = async (p) => {
    sent.push(imagesOf(p).length);
    if (imagesOf(p).some((b) => b.source.data === badB64)) throw err400('Could not process image');
    return reply({ pick: 1 });
  };
  const logs = [];
  await fillInboxFromCommons({
    jobDir: job,
    llm: async () => ({ scenes: [{ n: 2, queries: ['Kehlsteinhaus'] }] }),
    visionLlm: (o) => callVisionJSON({ ...o, request }),
    fetchImpl,
    ffmpeg: path.join(home, 'ffmpeg-yok', 'ffmpeg.exe'),
    logFn: (m) => logs.push(m),
  });
  assert.deepEqual(sent, [2, 1, 1], logs.join('\n'));
  assert.ok(logs.some((m) => /^görsel kutusu 02: seçim yapılamadı \(.*Could not process image/.test(m)), logs.join('\n'));
  assert.ok(logs.includes('görsel kutusu 02: seçilen fotoğraf dönüştürülemedi (Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg)'), 'okunabilen 2004 fotoğrafı seçildi');
  assert.ok(!logs.some((m) => /Yapılandırılmış çıktı bu çağrıda kullanılamadı/.test(m)));
  assert.equal(fs.existsSync(STORE), false);
});
