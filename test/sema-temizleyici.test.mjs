// Şema temizleyici (Eagle's Nest yangını, iş 20261024-950730): yapılandırılmış çıktı dört çağrıda HTTP 400 ile
// isteme düştü — sahne şeması "too many optional parameters (60)", kurgu yönetmeni planı 52, SEO "minItems values
// other than 0 or 1", konu kimliği "additionalProperties: object". API'ye giden kopya derleyicinin sınırlarına
// uyar; yanıt asıl şekline döner ve ASIL şemayla doğrulanır (minItems vb. kodda hâlâ zorunlu).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-wire-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { wireSchema, wireCost, validateSchema, WIRE_MAX_OPTIONAL, WIRE_MAX_UNION } = await import('../src/structured-output.js');
const { callJSON } = await import('../src/llm.js');
const { SCENES_SCHEMA } = await import('../src/pipeline/docu-script.js');
const { PLAN_SCHEMA } = await import('../src/pipeline/docu-edit-director.js');
const { SEO_SCHEMA } = await import('../src/pipeline/seo.js');
const { bibleSchema } = await import('../src/pipeline/docu-topic-bible.js');

const BANNED = ['maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'uniqueItems', 'oneOf'];
function wireProblems(node, at = '$', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((s, i) => wireProblems(s, `${at}[${i}]`, out)); return out; }
  for (const k of BANNED) if (k in node) out.push(`${at}: ${k}`);
  if (node.minItems > 1) out.push(`${at}: minItems ${node.minItems}`);
  if ('additionalProperties' in node && node.additionalProperties !== false) out.push(`${at}: additionalProperties ${JSON.stringify(node.additionalProperties)}`);
  if (node.properties && node.additionalProperties !== false) out.push(`${at}: additionalProperties eksik`);
  for (const k of ['items', 'anyOf', 'allOf']) if (node[k]) wireProblems(node[k], `${at}.${k}`, out);
  for (const [k, s] of Object.entries(node.properties || {})) wireProblems(s, `${at}.${k}`, out);
  return out;
}
const reply = (obj) => ({ model: 'offline', usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const SHAPES = { scenes: SCENES_SCHEMA, editPlan: PLAN_SCHEMA, seo: SEO_SCHEMA, topicBible: bibleSchema() };

test('sayım API ile aynı: sahne şeması 60, kurgu planı 52 isteğe bağlı alan', () => {
  assert.equal(wireCost(SCENES_SCHEMA).optional, 60);
  assert.equal(wireCost(PLAN_SCHEMA).optional, 52);
});

for (const [name, schema] of Object.entries(SHAPES)) {
  test(`${name}: API'ye giden şema derleyici sınırlarında`, () => {
    const w = wireSchema(schema);
    assert.deepEqual(wireProblems(w.schema), []);
    const c = wireCost(w.schema);
    assert.ok(c.optional <= WIRE_MAX_OPTIONAL, `isteğe bağlı ${c.optional}`);
    assert.ok(c.union <= WIRE_MAX_UNION, `birleşim ${c.union}`);
    assert.ok(JSON.stringify(schema).length > 0 && wireSchema(schema) === w, 'aynı şema için önbellek');
  });
}

test('asıl şema değişmez; minItems/maxLength yanıt doğrulamasında hâlâ geçerli', () => {
  const before = JSON.stringify(SEO_SCHEMA);
  const w = wireSchema(SEO_SCHEMA);
  assert.equal(JSON.stringify(SEO_SCHEMA), before);
  assert.equal(w.schema.properties.titles.minItems, 1);
  assert.match(w.schema.properties.titles.description, /minItems: 3/);
  const { value } = w.restore({ titles: ['Only one title here'], description: 'x'.repeat(40), tags: ['a', 'b', 'c', 'd', 'e'], thumbnailText: 'WHY?', pinnedComment: 'What would you have done?', evidence: [] });
  const errors = validateSchema(value, SEO_SCHEMA);
  assert.ok(errors.some((e) => /titles: en az 3/.test(e)), errors.join('; '));
  assert.ok(errors.some((e) => /evidence: en az 3/.test(e)), errors.join('; '));
});

test('sahne: taşan alanlar extraJson metninden geri açılır ve asıl şemadan geçer', () => {
  const w = wireSchema(SCENES_SCHEMA);
  const item = w.schema.properties.scenes.items;
  assert.ok(item.required.includes('extraJson') && item.properties.extraJson.type === 'string');
  for (const k of ['imagePrompt', 'source', 'search', 'commons']) assert.ok(item.properties[k], `${k} dilbilgisinde kalmalı`);
  assert.ok(!item.properties.places && /"places"/.test(item.properties.extraJson.description), 'harita yerleri JSON metninde, şemasıyla');
  const answer = { scenes: [
    { type: 'photo', mood: 'tension', say: 'The road was four meters wide.', dur: 4, source: 'archive', search: 'Kehlsteinhaus road 2026', extraJson: '{}' },
    { type: 'map', mood: 'tension', say: 'One road led up.', dur: 5, extraJson: JSON.stringify({ region: 'world', places: [{ label: 'Kehlstein', lat: 47.61, lon: 13.04 }], from: null }) },
  ] };
  const { value, errors } = w.restore(answer);
  assert.deepEqual(errors, []);
  assert.equal(value.scenes[0].extraJson, undefined);
  assert.deepEqual(value.scenes[1].places, [{ label: 'Kehlstein', lat: 47.61, lon: 13.04 }]);
  assert.equal('from' in value.scenes[1], false, 'null = yazılmamış');
  assert.deepEqual(validateSchema(value, SCENES_SCHEMA), []);
});

test('küçük taşma zorunlu+null olur, null alan yanıtta silinir', () => {
  const props = Object.fromEntries(Array.from({ length: WIRE_MAX_OPTIONAL + 2 }, (_, i) => [`f${i}`, { type: 'string' }]));
  const schema = { type: 'object', properties: { id: { type: 'integer' }, ...props }, required: ['id'], additionalProperties: false };
  const w = wireSchema(schema);
  assert.equal(w.nulled, 2); assert.equal(w.packed, 0);
  assert.equal(wireCost(w.schema).optional, WIRE_MAX_OPTIONAL);
  const nulled = Object.keys(props).filter((k) => w.schema.required.includes(k));
  assert.equal(nulled.length, 2);
  for (const k of nulled) assert.deepEqual(w.schema.properties[k].type, ['string', 'null']);
  const { value } = w.restore({ id: 1, [nulled[0]]: null, [nulled[1]]: 'kept' });
  assert.deepEqual(value, { id: 1, [nulled[1]]: 'kept' });
  assert.deepEqual(validateSchema(value, schema), []);
});

test('konu kimliği: serbest params haritası JSON metni olarak gider, nesne olarak döner', () => {
  const schema = bibleSchema();
  const w = wireSchema(schema);
  assert.equal(w.schema.properties.params.type, 'string');
  const { value, errors } = w.restore({ params: '{"stamp":"CASE 41"}' });
  assert.deepEqual(errors, []);
  assert.deepEqual(value.params, { stamp: 'CASE 41' });
});

test('callJSON: API temiz şemayı alır, sahne yanıtı geri açılır; bozuk extraJson onarım turuna gider', async () => {
  const sent = [];
  const bad = { scenes: [{ type: 'photo', mood: 'tension', say: 'A.', dur: 3, extraJson: '{"places": [' }] };
  const good = { scenes: [{ type: 'map', mood: 'tension', say: 'B.', dur: 3, extraJson: '{"places":[{"label":"Obersalzberg","lat":47.63,"lon":13.04}]}' }] };
  const logs = [];
  const out = await callJSON({ user: 'Bölümü yaz', schema: SCENES_SCHEMA, logFn: (m) => logs.push(m), request: async (p) => { sent.push(structuredClone(p)); return reply(sent.length === 1 ? bad : good); } });
  assert.equal(sent.length, 2);
  for (const p of sent) {
    const s = p.output_config.format.schema;
    assert.deepEqual(wireProblems(s), []);
    assert.ok(wireCost(s).optional <= WIRE_MAX_OPTIONAL);
    assert.match(p.messages[0].content, /extraJson/);
    assert.doesNotMatch(p.messages[0].content, /JSON ŞEMASI \(birebir uygula\)/, 'dilbilgisi açıkken asıl şema isteme yazılmaz');
  }
  assert.match(sent[1].messages[0].content, /extraJson: JSON metni ayrıştırılamadı/);
  assert.deepEqual(out.scenes[0].places, [{ label: 'Obersalzberg', lat: 47.63, lon: 13.04 }]);
  assert.ok(logs.some((m) => /Şema API sınırına uyarlandı/.test(m)));
});

test('callJSON: SEO minItems artık 400 vermez ama 2 başlık yine reddedilir', async () => {
  const valid = { titles: ['The Fire on the Eagle’s Nest', 'One Road, Not Enough Water', 'What the Fire Took'], description: 'A fire on the Kehlstein, one road and 200 responders. {BOLUMLER} #history', tags: ['a', 'b', 'c', 'd', 'e'], thumbnailText: 'ONE ROAD', pinnedComment: 'Would you have closed the road?', evidence: [0, 1, 2].map((i) => ({ titleIndex: i, segId: `s0g${i}`, quote: 'a quote long enough' })) };
  const sent = [];
  const out = await callJSON({ user: 'SEO', schema: SEO_SCHEMA, request: async (p) => { sent.push(p); return reply(sent.length === 1 ? { ...valid, titles: valid.titles.slice(0, 2) } : valid); } });
  assert.equal(sent.length, 2, 'eksik başlık onarım turu ister');
  assert.equal(sent[0].output_config.format.schema.properties.titles.minItems, 1);
  assert.match(sent[1].messages[0].content, /titles: en az 3/);
  assert.equal(out.titles.length, 3);
});

test('400 yedeği korunur: şema yine reddedilirse istemde ASIL şema uygulanır', async () => {
  const sent = [];
  const schema = { type: 'object', properties: { text: { type: 'string', minLength: 2 } }, required: ['text'], additionalProperties: false };
  const out = await callJSON({ user: 'x', schema, request: async (p) => { sent.push(p); if (sent.length === 1) throw Object.assign(new Error('output_config.format.schema: something else'), { status: 400 }); return reply({ text: 'ok' }); } });
  assert.equal(out.text, 'ok');
  assert.ok(sent[0].output_config && !sent[1].output_config);
  assert.match(sent[1].messages[0].content, /"minLength":2/);
});
