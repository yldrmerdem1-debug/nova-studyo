import { validateSchema } from "./structured-output.js";
import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "./config.js";

let client = null;
let clientKey = null;

function getClient() {
  const { anthropicKey } = getSettings();
  if (!anthropicKey) throw new Error("Anthropic API anahtarı eksik. Ayarlar sayfasından ekleyin (veya Demo modunu açın).");
  if (!client || clientKey !== anthropicKey) {
    client = new Anthropic({
      apiKey: anthropicKey,
      // 10 dakikalık bir video 40+ istek demek. SDK varsayılanı 2 deneme;
      // tek bir 529 "Overloaded" tüm işi düşürüyordu. 429/5xx üstel geri çekilmeyle yenilenir.
      maxRetries: 6,
      timeout: 10 * 60 * 1000,
    });
    clientKey = anthropicKey;
  }
  return client;
}

function supportsFallbacks(model) {
  return model.startsWith("claude-opus-5") || model.startsWith("claude-fable-5");
}

/**
 * Model yoğunsa sıradaki modele geç. Ölçüldü (2026-08-05): Opus 5 yoğun saatlerde
 * isteklerin ~yarısına 529 "Overloaded" dönüyor; SDK'nın kendi yeniden denemeleri
 * bazen yetmiyor. 40+ istekli bir videoda tek kalıcı 529 tüm işi düşürürdü.
 */
const MODEL_BACKUPS = {
  "claude-opus-5-5": ["claude-opus-5", "claude-sonnet-5-5"],
  "claude-sonnet-5-5": ["claude-sonnet-5", "claude-opus-5-5"],
  "claude-opus-5": ["claude-opus-4-8", "claude-sonnet-5"],
  "claude-fable-5": ["claude-opus-5", "claude-opus-4-8"],
  "claude-sonnet-5": ["claude-sonnet-4-6", "claude-opus-4-8"],
};
const isOverload = (e) => e?.status === 429 || e?.status >= 500;

// ~16K üstü isteklerde akışsız çağrı HTTP zaman aşımına takılabilir.
// Opus 5'te düşünme varsayılan olarak AÇIK ve max_tokens düşünme+yanıtı birlikte
// sınırlıyor, yani uzun bölümlerde tavan gerçekten zorlanıyor.
const STREAM_ABOVE = 16000;

function assertNotCancelled({signal,isCancelled}={}) {
  if(signal?.aborted || isCancelled?.()) throw new Error('cancelled');
}

/** Tek modele tek istek (Opus 5 / Fable 5'te politika reddi için sunucu yedeği açık). */
async function callModel(c, model, params, control={}) {
  const base = { model, ...params };
  const big = (params.max_tokens || 0) > STREAM_ABOVE;

  const send = async (api, extra = {}) => {
    assertNotCancelled(control);
    const req = { ...base, ...extra };
    if (!big) return api.create(req, control.signal ? {signal:control.signal} : undefined);
    const stream = await api.stream(req, control.signal ? {signal:control.signal} : undefined);
    return stream.finalMessage();
  };

  if (supportsFallbacks(model)) {
    try {
      return await send(c.beta.messages, {
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (e) {
      if (e?.status === 400 || e?.status === 404) {
        return await send(c.messages); // hesap/sürüm desteklemiyorsa düz istek
      }
      throw e;
    }
  }
  return await send(c.messages);
}

async function createMessage(params, logFn, modelOverride = null, usage = null, control={}) {
  assertNotCancelled(control);
  const c = getClient();
  const primary = modelOverride || getSettings().model || "claude-opus-5-5";
  const chain = [primary, ...(MODEL_BACKUPS[primary] || [])];

  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    try {
      assertNotCancelled(control);
      assertUsageBudget(usage, chain[i]);
      return await callModel(c, chain[i], params, control);
    } catch (e) {
      assertNotCancelled(control);
      lastErr = e;
      // Yalnızca yoğunluk/limit hatasında model değiştir; 400/401 gibi hatalar
      // istekle ilgilidir, başka modelde de aynı sonucu verir.
      if (!isOverload(e) || i === chain.length - 1) throw e;
      logFn?.(`${chain[i]} yoğun (HTTP ${e.status}) → ${chain[i + 1]} deneniyor...`);
      await new Promise((r) => setTimeout(r, 1500));
      assertNotCancelled(control);
    }
  }
  throw lastErr;
}

/**
 * @param kesikOlur Yanıt token sınırında kesilirse ELDEKİ metinle devam edilsin mi?
 *   Serbest metinde (araştırma dosyası) evet — yarısı da işe yarar, iş durmamalı.
 *   JSON'da hayır — kesik JSON ayrıştırılamaz, hata vermek doğru.
 */
function textOf(resp, kesikOlur = false, logFn) {
  if (resp.stop_reason === "refusal") {
    // stop_details yalnızca reddetmede dolu gelir ve null olabilir — önce kontrol et
    const cat = resp.stop_details?.category;
    throw new Error(
      `Model bu isteği güvenlik nedeniyle reddetti${cat ? ` (${cat})` : ""}. Konuyu yumuşatıp tekrar deneyin.`
    );
  }
  const metin = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (resp.stop_reason === "max_tokens") {
    // Opus 5'te DÜŞÜNME de aynı max_tokens bütçesinden yiyor; zengin bir
    // araştırma isteğinde tavan kolayca doluyordu ve TÜM İŞ düşüyordu.
    // Serbest metinde eldekiyle devam etmek doğru: araştırma dosyasının
    // kısası, hiç olmamasından iyidir.
    if (kesikOlur && metin.trim().length > 200) {
      logFn?.(`Yanıt token sınırında kesildi; elde edilen ${metin.length} karakterle devam ediliyor.`);
      return metin;
    }
    throw new Error("Yanıt token sınırına takıldı — daha kısa bir bölüm/segment ile tekrar deneyin.");
  }
  return metin;
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  // Promptla JSON istendiğinde model sık sık ```json çitiyle sarar
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch {}
  }
  const a2 = text.indexOf("["), b2 = text.lastIndexOf("]");
  if (a2 >= 0 && b2 > a2) {
    try { return JSON.parse(text.slice(a2, b2 + 1)); } catch {}
  }
  throw new Error("Model geçerli JSON döndürmedi.");
}


/** Monetary values are estimates from user-supplied USD / million-token rates. */
export function sumUsage(target, resp, rates = target.modelRates || getSettings().modelRates || {}) {
  if (!target.requests && !target.byModel && (target.inputTokens > 0 || target.outputTokens > 0)) target.legacyUnpricedUsage = true;
  const u = resp?.usage || {};
  const model = resp?.model || 'unknown';
  const n = value => Number.isFinite(+value) ? Math.max(0, +value) : 0;
  const values = {uncachedInputTokens:n(u.input_tokens), outputTokens:n(u.output_tokens), cacheReadTokens:n(u.cache_read_input_tokens), cacheWriteTokens:n(u.cache_creation_input_tokens)};
  target.byModel ||= {};
  const entry = target.byModel[model] ||= {requests:0, inputTokens:0, outputTokens:0, uncachedInputTokens:0, cacheReadTokens:0, cacheWriteTokens:0, estimatedUsd:0, unpricedRequests:0};
  for (const obj of [target,entry]) {
    obj.requests = (obj.requests || 0) + 1;
    for (const [key,value] of Object.entries(values)) obj[key] = (obj[key] || 0) + value;
    obj.inputTokens = (obj.inputTokens || 0) + values.uncachedInputTokens + values.cacheReadTokens + values.cacheWriteTokens;
  }
  const r = rates[model] || {};
  const fields = [['uncachedInputTokens','input'],['outputTokens','output'],['cacheReadTokens','cacheRead'],['cacheWriteTokens','cacheWrite']];
  let estimated = 0;
  let complete = !!resp?.usage;
  for (const [key,rateKey] of fields) {
    if (!values[key]) continue;
    if (typeof r[rateKey] !== 'number' || !Number.isFinite(r[rateKey]) || r[rateKey] < 0) complete = false;
    else estimated += values[key] * r[rateKey] / 1e6;
  }
  // Tool fees, including server web search, are not token charges.
  const searches = n(u.server_tool_use?.web_search_requests);
  target.webSearchRequests = (target.webSearchRequests || 0) + searches;
  if (searches) complete = false;
  for (const obj of [target,entry]) {
    obj.estimatedUsd = +((obj.estimatedUsd || 0) + estimated).toFixed(8);
    obj.unpricedRequests = (obj.unpricedRequests || 0) + (complete ? 0 : 1);
    obj.estimateComplete = (obj.unpricedRequests || 0) === 0 && !obj.legacyUnpricedUsage;
  }
  target.unpricedModels = Object.entries(target.byModel).filter(([,v]) => v.unpricedRequests).map(([name]) => name);
  target.costNote = target.estimateComplete ? 'Kullanıcı fiyatlarıyla token maliyeti tahmini; fatura değildir.' : 'Kısmi tahmin: fiyatı bilinmeyen model/araç kullanımı veya eksik kullanım verisi var; fatura değildir.';
}

/**
 * Anthropic liste fiyatları ($ / 1M token; 2026-09). Ayarlarda modelRates yoksa yalnızca
 * HARCAMA TAHMİNİ (iş başına Claude tavanı, günlük satırları) için kullanılır; fatura değildir.
 * Önbellek okuma/yazma verilmemişse girdinin 0,1 / 1,25 katı sayılır.
 */
export const DEFAULT_CLAUDE_RATES = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};
function rateOf(model, rates) {
  const r = rates?.[model];
  if (r && Number.isFinite(r.input) && Number.isFinite(r.output)) return r;
  if (DEFAULT_CLAUDE_RATES[model]) return DEFAULT_CLAUDE_RATES[model];
  if (/fable|mythos/i.test(model)) return { input: 10, output: 50 };
  if (/opus/i.test(model)) return { input: 5, output: 25 };
  if (/haiku/i.test(model)) return { input: 1, output: 5 };
  return { input: 3, output: 15 }; // bilinmeyen: temkinli (yüksek) tahmin
}
/**
 * İşin şimdiye kadarki Claude harcaması (tahmini $): usage.byModel × fiyat. İşin usage
 * nesnesi bütün çalıştırmalar boyunca birikir (job.usage), yani "bu video" için toplamdır.
 */
export function claudeSpendUsd(usage, rates = usage?.modelRates || {}) {
  if (!usage) return 0;
  const by = usage.byModel || {};
  let usd = 0;
  for (const [model, e] of Object.entries(by)) {
    if (!/claude/i.test(model) || !e) continue;
    const r = rateOf(model, rates);
    const uncached = Number(e.uncachedInputTokens ?? e.inputTokens) || 0;
    usd += (uncached * r.input + (Number(e.outputTokens) || 0) * r.output
      + (Number(e.cacheReadTokens) || 0) * (r.cacheRead ?? r.input * 0.1)
      + (Number(e.cacheWriteTokens) || 0) * (r.cacheWrite ?? r.input * 1.25)) / 1e6;
  }
  // Eski kayıt (byModel yok): işin modeliyle tahmin.
  if (!Object.keys(by).length && (usage.inputTokens > 0 || usage.outputTokens > 0)) {
    const r = rateOf(usage.model || "claude-sonnet-5-5", rates);
    usd += ((Number(usage.inputTokens) || 0) * r.input + (Number(usage.outputTokens) || 0) * r.output) / 1e6;
  }
  return +usd.toFixed(4);
}

export function assertUsageBudget(usage, model, rates = usage?.modelRates || getSettings().modelRates || {}) {
  if (!(Number(usage?.budgetUsd) > 0)) return;
  if ((usage.estimatedUsd || 0) >= usage.budgetUsd) throw new Error('Tahmini model bütçesi doldu. Devam etmek için iş bütçesini artırın.');
  const r = rates[model];
  if (usage.unpricedRequests || usage.legacyUnpricedUsage || (!usage.requests && (usage.inputTokens > 0 || usage.outputTokens > 0)) || !r || ['input','output','cacheRead','cacheWrite'].some(k => typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0)) {
    throw new Error('Bütçe denetlenemiyor: model/araç fiyatı eksik. Ayarlarda model fiyatlarını tamamlayın veya tahmini bütçe sınırını kaldırın.');
  }
}

async function accountedRequest(request, params, {usage,logFn,model,signal,isCancelled}) {
  const control={signal,isCancelled};
  assertNotCancelled(control);
  const chosen = model || usage?.model || getSettings().model;
  assertUsageBudget(usage, chosen);
  const resp = await request(params, logFn, chosen, usage, control);
  if (usage) sumUsage(usage, resp);
  assertNotCancelled(control);
  return resp;
}

const JSON_ONLY_HINT = '\n\nYANIT BİÇİMİ: Sadece geçerli JSON döndür. Açıklama, kod çiti veya başka metin yazma.';
const JSON_TAVAN_UST = 64000;
const JSON_EN_COK_DENEME = 3;
/*
 * Schemas the API refused for their size ("too many optional parameters", "compiled grammar is
 * too large" — the docu chapter schema has ~58 optional fields): later calls with the same
 * schema skip the doomed request and go straight to the prompted schema.
 */
const SCHEMA_TOO_BIG = new WeakSet();
const TOO_BIG = /too many optional|grammar is too large|schema is too (large|complex)/i;

async function structuredRequest({system,user,schema,maxTokens=16000,usage,logFn,model,images=[],request=createMessage,validate,signal,isCancelled}) {
  let tavan = maxTokens;
  let useSchema = !!schema && !SCHEMA_TOO_BIG.has(schema);
  let repair = '';
  const hint = () => JSON_ONLY_HINT + (schema ? '\nJSON ŞEMASI (birebir uygula):\n' + JSON.stringify(schema) : '');
  for (let deneme = 1; deneme <= JSON_EN_COK_DENEME; deneme++) {
    assertNotCancelled({signal,isCancelled});
    const makeParams = () => {
      const prompt = user + (!useSchema ? hint() : '') + repair;
      const blocks = images.flatMap(im => [ ...(im.etiket ? [{type:'text',text:im.etiket}] : []), {type:'image',source:{type:'base64',media_type:im.mediaType || 'image/jpeg',data:im.data}} ]);
      const params = {max_tokens:tavan,system,messages:[{role:'user',content:images.length ? [...blocks,{type:'text',text:prompt}] : prompt}]};
      if (useSchema) params.output_config = {format:{type:'json_schema',schema}};
      return params;
    };
    let resp;
    try { resp = await accountedRequest(request, makeParams(), {usage,logFn,model,signal,isCancelled}); }
    catch (e) {
      // Fallback is local to this call. An overload never changes capability state.
      // A billing failure is not a schema capability failure. Passing it to
      // the alternate format would waste another request and hide the cause.
      if (!useSchema || ![400,404].includes(e?.status) || /credit balance is too low|insufficient credit/i.test(String(e?.message||''))) throw e;
      assertNotCancelled({signal,isCancelled});
      useSchema = false;
      if (TOO_BIG.test(String(e?.message || ''))) SCHEMA_TOO_BIG.add(schema);
      logFn?.(`Yapılandırılmış çıktı bu çağrıda kullanılamadı (${String(e?.message||e?.status||'').slice(0,160)}); tam JSON şeması istemde uygulanıyor.`);
      resp = await accountedRequest(request, makeParams(), {usage,logFn,model,signal,isCancelled});
    }
    try {
      const parsed = extractJson(textOf(resp));
      const errors = validateSchema(parsed, schema);
      if (!errors.length && validate) errors.push(...(validate(parsed) || []));
      if (errors.length) throw new Error('JSON şema doğrulaması: ' + errors.slice(0,12).join('; '));
      return parsed;
    } catch (e) {
      assertNotCancelled({signal,isCancelled});
      if (resp.stop_reason === 'refusal') throw e;
      const tavanaCarpti = resp.stop_reason === "max_tokens";
      if (deneme >= JSON_EN_COK_DENEME) throw new Error('JSON yanıtı 3 denemede doğrulanamadı. İsteği kısaltıp yeniden deneyin. ' + e.message);
      if (tavanaCarpti) tavan = Math.min(JSON_TAVAN_UST, tavan * 2);
      repair = '\n\nÖNCEKİ YANIT GEÇERSİZDİ. Tüm JSON nesnesini yeniden üret. Sorunlar: ' + e.message + hint();
      logFn?.('JSON yanıtı doğrulanamadı; sınırlı onarım deneniyor (' + deneme + '/3): ' + String(e.message).slice(0, 220));
    }
  }
}

export async function callJSON(options) { return structuredRequest(options); }
// Capability is tested per request; transient/provider errors never disable other models.
export function structuredOutputsAvailable() { return true; }
export async function callVisionJSON(options) { return structuredRequest({maxTokens:4000,model:'claude-haiku-4-5-20251001',...options}); }

export function researchText(resp) {
  const sources = [];
  const text = (resp.content || []).filter(b => b.type === 'text').map(b => {
    const links = (b.citations || []).filter(c => /^https?:\/\//i.test(c.url || '')).map(c => {
      sources.push(c);
      return '[' + String(c.title || 'Kaynak').replace(/[\[\]\n]/g,' ') + '](' + c.url + ')';
    });
    return b.text + (links.length ? ' ' + [...new Set(links)].join(' ') : '');
  }).join('\n');
  // The 2026 search tool (dynamic filtering) filters results in code: the answer quotes its sources
  // inline but its text blocks carry no citations. The pages it searched are still the provenance.
  const searched = (resp.content || []).filter(b => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap(b => b.content).filter(r => /^https?:\/\//i.test(r?.url || '')).map(r => ({url:r.url,title:r.title || '',page_age:r.page_age || ''}));
  return {text,sources,searched};
}

/** Research returns text, including inline citations and machine-readable provenance. */
export async function callText({system,user,webSearch=false,maxSearches=6,maxTokens=16000,usage,logFn,model,request=createMessage,signal,isCancelled}) {
  const params = {max_tokens:maxTokens,system,messages:[{role:'user',content:user}]};
  if (webSearch) params.tools = [{type:'web_search_20260209',name:'web_search',max_uses:maxSearches}];
  const parts = [], citations = [], searched = [];
  let warning = webSearch ? '' : '> Web araştırması kapalı: bilgiler web üzerinden doğrulanmadı. Yayından önce kaynakları kontrol edin.';
  let resp;
  const send = () => accountedRequest(request,params,{usage,logFn,model,signal,isCancelled});
  try { resp = await send(); }
  catch (e) {
    if (!webSearch || e?.status !== 400) throw e;
    assertNotCancelled({signal,isCancelled});
    delete params.tools;
    warning = '> Web araştırması kullanılamadı: bilgiler web üzerinden doğrulanmadı. Güncel iddiaları yayın öncesi kontrol edin.';
    logFn?.(warning);
    resp = await send();
  }
  let guard = 0;
  for (;;) {
    textOf(resp,true,logFn); // refuse/truncation safeguards still apply
    const piece = researchText(resp); parts.push(piece.text); citations.push(...piece.sources); searched.push(...piece.searched);
    if (resp.stop_reason !== 'pause_turn') break;
    if (guard++ >= 4) { warning += '\n> Web araştırması tamamlanamadı: araç devam sınırı doldu.';break; }
    params.messages.push({role:'assistant',content:resp.content});
    assertNotCancelled({signal,isCancelled});
    resp = await send();
  }
  // No structured citations: the searched pages the answer actually links are the provenance.
  if (webSearch && !citations.length) {
    const body = parts.join('\n');
    citations.push(...searched.filter(r => body.includes(r.url)));
  }
  if (webSearch && !citations.length && !warning) warning = '> Araştırmada doğrulanabilir kaynak bağlantısı alınamadı; bilgiler doğrulanmadı.';
  const unique = [...new Map(citations.map(c => [c.url+'|'+(c.cited_text || ''),c])).values()];
  return [warning,...parts,unique.length ? '\n## Kaynak kayıtları\n' + JSON.stringify(unique,null,2) : ''].filter(Boolean).join('\n\n');
}
