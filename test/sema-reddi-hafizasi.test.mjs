// ŞEMA REDDİ HAFIZASI + BOŞ BIRAKILABİLİR ENUM (24-25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR 1 (Eagle's Nest 20261024-950730 01:31:41, denizaltı 20261024-373aaf 05:49:38 ve 16:20:50):
// konu kimliği şeması HER çalıştırmada 400 aldı — "Invalid schema: Enum value 'headlines' does not match
// declared type". Temizleyici `opening: {type:'string', enum: OPENING_KINDS}` alanını {type:['string','null'],
// enum:[…, null]} yapıyordu; API bunu kabul etmiyor. Enum artık anyOf [asıl alan, {type:'null'}] olur.
//
// ÖLÇÜLEN KUSUR 2 (373aaf bölüm 1 05:30:21 → 05:36:23, kurgu yönetmeni 16:13:56 → 16:19:57; 950730 01:24:22 →
// 01:30:23): "Schema is too complex." 6 dakika sonra geliyor. Karar bellekte, şema NESNESİNE bağlı bir WeakSet'te
// tutuluyordu: her yeni süreç (ve her yeni şema nesnesi) aynı 6 dakikayı yeniden ödedi. Karar artık API'ye giden
// şemanın özetiyle data/schema-refusals.json'da bir hafta duruyor; paketli şemanın yanıtı 90 sn içinde başlamazsa
// istek kesilip istemle sürülüyor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-sema-reddi-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { wireSchema, validateSchema, WIRE_MAX_OPTIONAL } = await import('../src/structured-output.js');
const { callJSON, _callModel } = await import('../src/llm.js');
const { bibleSchema, OPENING_KINDS } = await import('../src/pipeline/docu-topic-bible.js');

const STORE = path.join(home, 'data', 'schema-refusals.json');
const reply = (obj) => ({ model: 'offline', usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
function enumWithTypeArray(node, at = '$', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((s, i) => enumWithTypeArray(s, `${at}[${i}]`, out)); return out; }
  if (('enum' in node || 'const' in node) && Array.isArray(node.type)) out.push(at);
  if (Array.isArray(node.enum) && node.enum.includes(null)) out.push(`${at}: enum içinde null`);
  for (const k of ['items', 'anyOf', 'allOf']) if (node[k]) enumWithTypeArray(node[k], `${at}.${k}`, out);
  for (const [k, s] of Object.entries(node.properties || {})) enumWithTypeArray(s, `${at}.${k}`, out);
  return out;
}
const textOfReply = (r) => r.content.map((b) => b.text).join('');
const isNullableEnum = (n, values) => Array.isArray(n.anyOf) && n.anyOf.length === 2
  && n.anyOf.some((b) => b.type === 'null') && n.anyOf.some((b) => b.type === 'string' && JSON.stringify(b.enum) === JSON.stringify(values));

test('küçük taşma: son isteğe bağlı alan enum ise anyOf [enum, null] olur, tür dizisi + enum asla', () => {
  const props = Object.fromEntries(Array.from({ length: WIRE_MAX_OPTIONAL + 1 }, (_, i) => [`f${i}`, { type: 'string' }]));
  const schema = { type: 'object', properties: { id: { type: 'integer' }, ...props, opening: { type: 'string', enum: ['headlines', 'quote'] } }, required: ['id'], additionalProperties: false };
  const w = wireSchema(schema);
  assert.equal(w.nulled, 2);
  assert.ok(w.schema.required.includes('opening'), 'son bildirilen alan zorunlu/boş bırakılabilir oldu');
  assert.deepEqual(enumWithTypeArray(w.schema), []);
  assert.ok(isNullableEnum(w.schema.properties.opening, ['headlines', 'quote']), JSON.stringify(w.schema.properties.opening));
  const nulled = w.schema.required.filter((k) => k !== 'id');
  const { value, errors } = w.restore({ id: 1, ...Object.fromEntries(nulled.map((k) => [k, null])) });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { id: 1 }, 'null = yazılmamış');
  assert.deepEqual(validateSchema(value, schema), []);
  const kept = w.restore({ id: 2, f0: 'a', ...Object.fromEntries(nulled.map((k) => [k, null])), opening: 'quote' }).value;
  assert.equal(kept.opening, 'quote');
  assert.deepEqual(validateSchema(kept, schema), []);
});

test('konu kimliği şeması: opening dahil hiçbir enum tür dizisiyle gitmez (Enum value \'headlines\' 400)', () => {
  const w = wireSchema(bibleSchema());
  assert.deepEqual(enumWithTypeArray(w.schema), []);
  const op = w.schema.properties.opening;
  assert.ok(w.schema.required.includes('opening'), 'opening, ölçülen işlerdeki gibi boş bırakılabilir alanlardan');
  assert.ok(isNullableEnum(op, OPENING_KINDS), JSON.stringify(op));
  const { value } = w.restore({ motif: 'telemetry', opening: null });
  assert.equal('opening' in value, false);
});

// 24+16'yı aşan isteğe bağlı alan: büyük taşma, alanlar extraJson metnine paketlenir (kurgu planı / sahne şeması gibi).
const packedSchema = () => ({ type: 'object', properties: { text: { type: 'string' }, ...Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`o${i}`, { type: 'string' }])) }, required: ['text'], additionalProperties: false });
const smallSchema = (tag) => ({ type: 'object', properties: { text: { type: 'string', description: tag } }, required: ['text'], additionalProperties: false });
const tooComplex = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Schema is too complex."}}'), { status: 400 });

test('"too complex" kararı yapısı aynı YENİ şema nesnesinde de geçerli ve diske yazılır; bir hafta sonra yeniden denenir', async () => {
  fs.rmSync(STORE, { force: true });
  const base = packedSchema();
  const sent = [];
  const request = async (p) => { sent.push(p); if (p.output_config) throw tooComplex(); return reply({ text: 'ok' }); };
  assert.equal((await callJSON({ user: 'x', schema: structuredClone(base), request })).text, 'ok');
  assert.equal(sent.length, 2);
  assert.ok(sent[0].output_config && !sent[1].output_config);
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const keys = Object.keys(store);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^[0-9a-f]{40}$/);
  assert.match(store[keys[0]].reason, /too complex/i);
  assert.ok(Date.now() - Date.parse(store[keys[0]].at) < 60e3);

  // Yeni süreçteki gibi: başka bir nesne, aynı yapı → ilk istek dilbilgisiz, asıl şema istemde.
  sent.length = 0;
  const logs = [];
  assert.equal((await callJSON({ user: 'x', schema: structuredClone(base), request, logFn: (m) => logs.push(m) })).text, 'ok');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].output_config, undefined);
  assert.match(sent[0].messages[0].content, /JSON ŞEMASI \(birebir uygula\)/);
  assert.ok(logs.some((m) => /son 7 gün içinde API'ce reddedildi/.test(m)), logs.join(' | '));

  // Süresi dolmuş karar: dilbilgisi yeniden denenir.
  store[keys[0]].at = new Date(Date.now() - 8 * 864e5).toISOString();
  fs.writeFileSync(STORE, JSON.stringify(store));
  sent.length = 0;
  await callJSON({ user: 'x', schema: structuredClone(base), request });
  assert.ok(sent[0].output_config, 'bir haftadan eski karar unutulur');

  // Kayıt diskte: dosya silinince süreç belleği kararı tutmaz.
  fs.rmSync(STORE, { force: true });
  sent.length = 0;
  await callJSON({ user: 'x', schema: structuredClone(base), request: async (p) => { sent.push(p); return reply({ text: 'ok' }); } });
  assert.ok(sent[0].output_config);
});

test('boyutla ilgisiz 400 (geçersiz şema, resim) kalıcı karar olmaz', async () => {
  fs.rmSync(STORE, { force: true });
  const sent = [];
  const request = async (p) => { sent.push(p); if (p.output_config && sent.length === 1) throw Object.assign(new Error("output_config.format.schema: Invalid schema: Enum value 'x' does not match declared type"), { status: 400 }); return reply({ text: 'ok' }); };
  await callJSON({ user: 'x', schema: smallSchema('a'), request });
  await callJSON({ user: 'x', schema: smallSchema('a'), request });
  assert.ok(sent[0].output_config && !sent[1].output_config && sent[2].output_config);
  assert.equal(fs.existsSync(STORE), false);
});

test('paketli şema yanıt başlama bekçisiyle gider; bekçi kesince istemle sürer ve karar kalır', async () => {
  fs.rmSync(STORE, { force: true });
  const controls = [];
  await callJSON({ user: 'x', schema: smallSchema('b'), request: async (p, log, m, u, control) => { controls.push(control); return reply({ text: 'ok' }); } });
  assert.equal(controls[0].firstByteMs, undefined, 'küçük şema: normal istek, bekçi yok');

  controls.length = 0;
  const sent = [];
  const stall = async (p, log, m, u, control) => {
    sent.push(p); controls.push(control);
    if (p.output_config) throw Object.assign(new Error('Schema is too complex: yanıt 90 sn içinde başlamadı (istemci bekçisi)'), { schemaStall: true });
    return reply({ text: 'ok' });
  };
  const base = packedSchema();
  assert.equal((await callJSON({ user: 'x', schema: structuredClone(base), request: stall })).text, 'ok');
  assert.equal(controls[0].firstByteMs, 90e3);
  assert.equal(controls[1].firstByteMs, undefined, 'istemle yeniden soruşta bekçi yok');
  assert.ok(sent[0].output_config && !sent[1].output_config);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(STORE, 'utf8'))).length, 1);
  sent.length = 0;
  await callJSON({ user: 'x', schema: structuredClone(base), request: stall });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].output_config, undefined);
});

// Sahte SDK akışı: 'connect' yanıt başlıkları gelince, finalMessage cevap bitince.
function fakeStream({ connectMs = null, doneMs = 0 } = {}) {
  const on = {}; let ok, fail; const done = new Promise((a, b) => { ok = a; fail = b; });
  const timers = [];
  if (connectMs != null) timers.push(setTimeout(() => { (on.connect || []).forEach((f) => f()); timers.push(setTimeout(() => ok(reply({ text: 'ok' })), doneMs)); }, connectMs));
  return { on(ev, f) { (on[ev] ||= []).push(f); return this; }, abort() { timers.forEach(clearTimeout); fail(new Error('Request was aborted.')); }, finalMessage: () => done };
}
const fakeClient = (stream) => {
  const calls = [];
  return { calls, messages: { create: async (req) => { calls.push(['create', req]); return reply({ text: 'ok' }); }, stream: (req) => { calls.push(['stream', req]); return stream(); } } };
};

test('callModel: bekçi yalnızca yanıtın BAŞLAMASINI sınırlar; uzun cevap kesilmez; bekçisiz istek eskisi gibi', async () => {
  const params = { max_tokens: 16000, messages: [{ role: 'user', content: 'x' }] };
  const never = fakeClient(() => fakeStream());
  const t0 = Date.now();
  await assert.rejects(_callModel(never, 'claude-sonnet-4-6', params, { firstByteMs: 40 }), (e) => e.schemaStall === true && /too complex/i.test(e.message));
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(never.calls[0][0], 'stream', '16k tavanlı istek de bekçi için akışla gider');

  const slow = fakeClient(() => fakeStream({ connectMs: 5, doneMs: 120 }));
  assert.equal(textOfReply(await _callModel(slow, 'claude-sonnet-4-6', params, { firstByteMs: 40 })), '{"text":"ok"}');

  const plain = fakeClient(() => fakeStream({ connectMs: 0 }));
  await _callModel(plain, 'claude-sonnet-4-6', params, {});
  assert.equal(plain.calls[0][0], 'create', 'bekçisiz ≤16k istek akışsız kalır');
});
