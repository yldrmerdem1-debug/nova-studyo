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
