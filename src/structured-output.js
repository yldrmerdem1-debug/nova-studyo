/**
 * A number the model wrote as text ("41,000,000,000", "12.5", " 300 ") where the schema wants ONLY a number becomes
 * that number (Banco Master, Oct 2026: a counter's from/to came back as strings three times and the whole job
 * failed). Conservative: thousands separators only in groups of three, one decimal point, nothing else in the
 * string — "1,5", "R$ 41bn", "about 300" stay text and still fail validation. Returns a new value; input untouched.
 */
export function coerceNumbers(value, schema) {
  if (!schema || typeof schema !== 'object' || value == null) return value;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (typeof value === 'string' && types.length && types.every((t) => t === 'number' || t === 'integer')) {
    const s = value.trim().replace(/_/g, '');
    const m = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.exec(s);
    if (m) {
      const n = Number(s.replace(/,/g, ''));
      if (Number.isFinite(n) && (!types.includes('integer') || types.includes('number') || Number.isInteger(n))) return n;
    }
    return value;
  }
  if (Array.isArray(value)) return schema.items ? value.map((x) => coerceNumbers(x, schema.items)) : value;
  if (typeof value === 'object') {
    const props = schema.properties || {};
    let out = null;
    for (const [k, v] of Object.entries(value)) {
      const sub = Object.hasOwn(props, k) ? props[k] : (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null);
      const c = sub ? coerceNumbers(v, sub) : v;
      if (c !== v) (out ||= { ...value })[k] = c;
    }
    return out || value;
  }
  return value;
}

/*
 * WIRE SCHEMA — the copy of a schema the API's grammar compiler accepts. Eagle's Nest fire (job
 * 20261024-950730): four calls of one video fell back to the prompted schema with HTTP 400 — "too many
 * optional parameters (60)" for the scene schema, 52 for the edit plan, "minItems values other than 0 or 1"
 * for SEO, "additionalProperties: object" for the topic bible. Limits from the structured-outputs docs
 * (Oct 2026): 24 optional and 16 union-typed (anyOf / type array) parameters per request, minItems 0 or 1,
 * additionalProperties only false, no number/string/array-length constraints.
 *  - unsupported keywords are dropped and written into the description ({minItems: 3}) like the SDKs do;
 *  - a free-form map (additionalProperties: {schema}) becomes a JSON-text string;
 *  - too many optional fields: a small overflow becomes required-but-nullable (null = left out), a big one
 *    moves into one required `extraJson` string per object whose description carries the fields' schemas.
 * The ORIGINAL schema stays the contract: restore() turns the answer back into its shape and llm.js
 * validates it against the original, so minItems/maxLength/pattern are still enforced in code.
 */
export const WIRE_MAX_OPTIONAL = 24;
export const WIRE_MAX_UNION = 16;
const WIRE_DROP = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'patternProperties', 'propertyNames', 'dependentRequired', 'dependentSchemas', 'if', 'then', 'else', 'not', 'contains', 'minContains', 'maxContains', 'prefixItems', 'unevaluatedProperties', 'unevaluatedItems', '$schema', '$id']);
const WIRE_FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid']);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const typesOf = (n) => Array.isArray(n.type) ? n.type : n.type ? [n.type] : [];

function toWire(node, ctx) {
  if (!isObj(node)) return node;
  const freeForm = typesOf(node).includes('object') && (isObj(node.additionalProperties) || node.additionalProperties === true || !node.properties);
  if (freeForm) {
    const out = { type: 'string', description: `${node.description ? node.description + ' — ' : ''}JSON nesnesini METİN olarak yaz ("{}" boşsa). Şeması: ${JSON.stringify(node)}` };
    ctx.json.add(out); ctx.orig.set(out, node); ctx.stripped++;
    return out;
  }
  const out = {}, notes = [];
  for (const [k, v] of Object.entries(node)) {
    if (WIRE_DROP.has(k)) notes.push(`${k}: ${JSON.stringify(v)}`);
    else if (k === 'minItems') { if (v > 1) { out.minItems = 1; notes.push(`minItems: ${v}`); } else out.minItems = v; }
    else if (k === 'format' && !WIRE_FORMATS.has(v)) notes.push(`format: ${JSON.stringify(v)}`);
    else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toWire(s, ctx)]));
    else if (k === 'items' || k === 'additionalItems') out[k] = Array.isArray(v) ? v.map((s) => toWire(s, ctx)) : toWire(v, ctx);
    else if (k === 'anyOf' || k === 'oneOf') out.anyOf = [...(out.anyOf || []), ...v.map((s) => toWire(s, ctx))];
    else if (k === 'allOf') out.allOf = v.map((s) => toWire(s, ctx));
    else if (k === '$defs' || k === 'definitions') out[k] = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toWire(s, ctx)]));
    else if (k !== 'additionalProperties') out[k] = v;
  }
  if (out.properties) out.additionalProperties = false;
  if (notes.length) { out.description = `${out.description ? out.description + ' ' : ''}{${notes.join(', ')}}`; ctx.stripped += notes.length; }
  ctx.orig.set(out, node);
  return out;
}

/** Optional and union-typed parameters the grammar compiler would count for this (wire) schema. */
export function wireCost(node, isParam = false) {
  if (!isObj(node)) return { optional: 0, union: 0 };
  let optional = 0, union = isParam && (Array.isArray(node.type) || node.anyOf) ? 1 : 0;
  const add = (c) => { optional += c.optional; union += c.union; };
  if (node.properties) {
    const req = new Set(node.required || []);
    for (const [k, s] of Object.entries(node.properties)) { if (!req.has(k)) optional++; add(wireCost(s, true)); }
  }
  for (const s of [].concat(node.items || [], node.anyOf || [], node.allOf || [], Object.values(node.$defs || {}), Object.values(node.definitions || {}))) add(wireCost(s, true));
  return { optional, union };
}

function objectNodes(node, out = []) {
  if (!isObj(node)) return out;
  if (node.properties) out.push(node);
  for (const s of Object.values(node.properties || {})) objectNodes(s, out);
  for (const s of [].concat(node.items || [], node.anyOf || [], node.allOf || [], Object.values(node.$defs || {}), Object.values(node.definitions || {}))) objectNodes(s, out);
  return out;
}

function nullable(s) {
  // An enum (or const) keeps its single type and gets null as its own branch: {type:['string','null'], enum:[…, null]}
  // is refused — "Invalid schema: Enum value 'headlines' does not match declared type" for the topic bible's
  // `opening` on every run (Eagle's Nest 950730 01:31:41, submarine 373aaf 05:49:38 and 16:20:50).
  if (s.properties || s.items || s.anyOf || s.enum || 'const' in s || !s.type) return { anyOf: [...(s.anyOf || [s]), { type: 'null' }], ...(s.description ? { description: s.description } : {}) };
  return { ...s, type: [...new Set([...typesOf(s), 'null'])] };
}

function packDescription(pack, ctx) {
  const fields = Object.fromEntries(pack.fields.map(([k, s]) => [k, ctx.orig.get(s) || s]));
  return `Dilbilgisine sığmayan isteğe bağlı alanlar: kullandıklarını TEK bir JSON nesnesi olarak bu METNE yaz, hiçbiri yoksa "{}". Anahtarlar ve şemaları: ${JSON.stringify(fields)}`;
}

function fitWire(wire, ctx) {
  for (let guard = 0; guard < 64; guard++) {
    const c = wireCost(wire);
    const needOpt = c.optional - WIRE_MAX_OPTIONAL, needUni = c.union - WIRE_MAX_UNION;
    if (needOpt <= 0 && needUni <= 0) return;
    // The object whose optional fields carry the most grammar weight goes first.
    const weigh = (n, k) => { const s = wireCost(n.properties[k], true); return 1 + s.optional + s.union; };
    const cands = objectNodes(wire).map((n) => {
      const req = new Set(n.required || []);
      const opt = Object.keys(n.properties).filter((k) => !req.has(k));
      return { n, opt, w: opt.reduce((a, k) => a + weigh(n, k), 0) };
    }).filter((x) => x.opt.length).sort((a, b) => b.w - a.w);
    if (!cands.length) return; // nothing left to move: the API decides, llm.js falls back to the prompt
    const { n, opt } = cands[0];
    if (needUni <= 0 && needOpt <= WIRE_MAX_UNION - c.union) {
      // Small overflow: last-declared optional fields become required + nullable (an existing type array is free).
      const pick = [...opt].reverse().sort((a, b) => Number(Array.isArray(n.properties[b].type)) - Number(Array.isArray(n.properties[a].type))).slice(0, needOpt);
      for (const k of pick) { n.properties[k] = nullable(n.properties[k]); n.required = [...(n.required || []), k]; ctx.nulls.set(n, new Set([...(ctx.nulls.get(n) || []), k])); }
      ctx.nulled += pick.length;
      continue;
    }
    // Big overflow: the heaviest optional fields (ties: the last declared) move into one JSON-text field.
    const order = opt.map((k, i) => ({ k, i, w: weigh(n, k), s: wireCost(n.properties[k], true) }))
      .sort((a, b) => b.w - a.w || b.i - a.i);
    let pack = ctx.packs.get(n);
    if (!pack) {
      let key = 'extraJson';
      while (Object.hasOwn(n.properties, key)) key = '_' + key;
      pack = { key, fields: [] };
      ctx.packs.set(n, pack);
      n.properties[key] = { type: 'string' };
      n.required = [...(n.required || []), key];
    }
    let o = needOpt, u = needUni;
    for (const f of order) {
      if (o <= 0 && u <= 0) break;
      pack.fields.push([f.k, n.properties[f.k]]);
      delete n.properties[f.k];
      o -= 1 + f.s.optional; u -= f.s.union;
      ctx.packed++;
    }
    n.properties[pack.key].description = packDescription(pack, ctx);
  }
}

function restoreWire(value, node, ctx, at, errors) {
  if (!isObj(node) || value == null) return value;
  if (ctx.json.has(node)) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value.trim() || '{}'); } catch { errors.push(`${at}: JSON metni ayrıştırılamadı`); return value; }
  }
  // A nullable wrapper (anyOf [schema, null]): follow the branch that fits the value.
  if (node.anyOf && !node.properties && !node.items) {
    const kind = Array.isArray(value) ? 'array' : typeof value;
    const br = node.anyOf.find((s) => kind === 'array' ? s.items || typesOf(s).includes('array') : kind === 'object' ? s.properties || typesOf(s).includes('object') : false);
    return br ? restoreWire(value, br, ctx, at, errors) : value;
  }
  if (Array.isArray(value)) return isObj(node.items) ? value.map((x, i) => restoreWire(x, node.items, ctx, `${at}[${i}]`, errors)) : value;
  if (!isObj(value) || !node.properties) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = Object.hasOwn(node.properties, k) ? restoreWire(v, node.properties[k], ctx, `${at}.${k}`, errors) : v;
  for (const k of ctx.nulls.get(node) || []) if (out[k] === null) delete out[k];
  const pack = ctx.packs.get(node);
  if (pack && Object.hasOwn(out, pack.key)) {
    const raw = out[pack.key];
    delete out[pack.key];
    let extra = {};
    if (typeof raw === 'string' && raw.trim()) {
      try { extra = JSON.parse(raw); } catch { errors.push(`${at}.${pack.key}: JSON metni ayrıştırılamadı`); extra = {}; }
    } else if (isObj(raw)) extra = raw;
    if (!isObj(extra)) errors.push(`${at}.${pack.key}: JSON nesnesi olmalı`);
    else for (const [k, v] of Object.entries(extra)) if (v !== null && !Object.hasOwn(out, k)) out[k] = v;
  }
  return out;
}

const WIRE_CACHE = new WeakMap();
/**
 * The schema to send + restore(answer) → {value, errors}. Cached per schema object. `changed` says whether
 * anything differs from the original; `packed`/`nulled`/`stripped` count what was moved, for the log.
 */
export function wireSchema(schema) {
  if (!isObj(schema)) return { schema, restore: (value) => ({ value, errors: [] }), changed: false, packed: 0, nulled: 0, stripped: 0, extraKeys: [] };
  const hit = WIRE_CACHE.get(schema);
  if (hit) return hit;
  const ctx = { orig: new WeakMap(), json: new WeakSet(), nulls: new WeakMap(), packs: new Map(), packed: 0, nulled: 0, stripped: 0 };
  const wire = toWire(schema, ctx);
  fitWire(wire, ctx);
  const plan = {
    schema: wire,
    restore: (value) => { const errors = []; return { value: restoreWire(value, wire, ctx, '$', errors), errors }; },
    changed: JSON.stringify(wire) !== JSON.stringify(schema),
    packed: ctx.packed, nulled: ctx.nulled, stripped: ctx.stripped,
    extraKeys: [...new Set([...ctx.packs.values()].map((p) => p.key))],
  };
  WIRE_CACHE.set(schema, plan);
  return plan;
}

/** Validate the JSON Schema subset used by pipeline requests, without coercing data. */
export function validateSchema(value, schema, at = '$') {
  if (!schema || schema === true) return [];
  if (schema === false) return [`${at}: bu değer kabul edilmiyor`];
  const errors = [];
  const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some(t => t === kind || t === 'integer' && Number.isInteger(value))) return [`${at}: beklenen tür ${types.join('/')}, gelen ${kind}`];
  if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(value))) errors.push(`${at}: izin verilen değerlerden biri olmalı`);
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${at}: sabit değer uyuşmuyor`);
  if (schema.anyOf && !schema.anyOf.some(s => !validateSchema(value, s, at).length)) errors.push(`${at}: anyOf uyuşmuyor`);
  if (schema.oneOf && schema.oneOf.filter(s => !validateSchema(value, s, at).length).length !== 1) errors.push(`${at}: oneOf uyuşmuyor`);
  for (const sub of schema.allOf || []) errors.push(...validateSchema(value, sub, at));
  if (kind === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: zorunlu alan eksik`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {}, key)) errors.push(...validateSchema(item, schema.properties[key], `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}.${key}: fazladan alan`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...validateSchema(item, schema.additionalProperties, `${at}.${key}`));
    }
  }
  if (kind === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: en az ${schema.minItems} öğe gerekli`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: en fazla ${schema.maxItems} öğe olabilir`);
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(x))).size !== value.length) errors.push(`${at}: öğeler benzersiz olmalı`);
    value.forEach((x,i) => errors.push(...validateSchema(x, schema.items, `${at}[${i}]`)));
  }
  if (kind === 'string') {
    if (schema.minLength != null && value.trim().length < schema.minLength) errors.push(`${at}: metin çok kısa`);
    if (schema.maxLength != null && [...value].length > schema.maxLength) errors.push(`${at}: metin çok uzun`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: metin biçimi uyuşmuyor`);
  }
  if (kind === 'number') {
    if (!Number.isFinite(value)) errors.push(`${at}: sayı sonlu olmalı`);
    if (schema.minimum != null && value < schema.minimum) errors.push(`${at}: minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${at}: maximum ${schema.maximum}`);
  }
  return errors;
}
