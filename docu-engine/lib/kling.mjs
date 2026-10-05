// KLING 3.0 — resimden video, doğrudan Kling API'si (Replicate aracısı yok, saniye başı ödenir).
// Hem motor (belgesel açılış hareketi) hem Nova (Shorts açılışı) bunu kullanır.
//
//   POST /image-to-video/kling-3.0   { contents: [prompt, first_frame], settings, options }
//   GET  /tasks?external_task_ids=…  → status submitted|processing|succeeded|failed, outputs[].url
//
// Fiyat (Ekim 2026, sessiz): 720p 0,6 · 1080p 0,8 birim/sn. Süre 3-15 sn, tam sayı: klip sahnenin
// ihtiyacı kadar istenir, fazlası ödenmez. Çıktı 30 gün sonra silinir — hemen indirilir.
export const KLING_API = 'https://api-singapore.klingai.com';
export const KLING_MODEL = 'kling-3.0';

/** The cheap model for motion that is not an opening (Kling 2.5 Turbo: 5 or 10 s, 0,3/0,5 birim/sn). */
export const KLING_CHEAP_MODEL = 'kling-2.5-turbo';
const isTurbo25 = (model) => /2\.5/.test(String(model));

/** Kling's units per second (no native audio), for the log line and the cost estimate. */
export const klingUnitsPerSecond = (resolution, model = KLING_MODEL) => isTurbo25(model)
  ? (resolution === '720p' ? 0.3 : 0.5)
  : (resolution === '720p' ? 0.6 : resolution === '4k' ? 3 : 0.8);

/** Requested length: Kling 3.0 takes whole seconds within 3-15; 2.5 Turbo only 5 or 10. */
export const klingDuration = (seconds, model = KLING_MODEL) => isTurbo25(model)
  ? ((Number(seconds) || 5) > 5 ? 10 : 5)
  : Math.min(15, Math.max(3, Math.ceil(Number(seconds) || 5)));

/** Kling has no negative-prompt field: the bans go into the prompt itself. */
export function klingBody({ image, prompt, negative = '', duration = 5, resolution = '1080p', externalId = '', model = KLING_MODEL }) {
  const text = `${String(prompt || '').trim()}${negative ? ` Avoid: ${negative}.` : ''}`.slice(0, 2500);
  const settings = { resolution, duration: klingDuration(duration, model) };
  if (!isTurbo25(model)) Object.assign(settings, { audio: 'off', multi_shot: false });
  return {
    contents: [
      { type: 'prompt', text },
      { type: 'first_frame', url: String(image).replace(/^data:[^;]+;base64,/, '') },
    ],
    settings,
    options: { external_task_id: externalId, watermark_info: { enabled: false } },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kling's error answer as an Error: quota (pack used up / arrears), moderation, busy (retry). */
function klingError(status, j, model) {
  const code = Number(j?.code);
  const msg = String(j?.message || j?.data?.message || `HTTP ${status}`).slice(0, 200);
  if (status === 401 || (code >= 1000 && code <= 1004)) return Object.assign(new Error('Kling anahtarı geçersiz — Ayarlar\'dan kontrol edin'), { auth: true });
  if (code === 1101 || code === 1102) return Object.assign(new Error('Kling paketi bitti ya da süresi doldu (klingai.com → API → kaynak paketi)'), { quota: true });
  if (code === 1300 || code === 1301) return Object.assign(new Error(`Kling içerik politikası reddetti: ${msg}`), { moderation: true });
  if (code === 1302 || code === 1303 || status === 429 || status >= 500) return Object.assign(new Error(`Kling meşgul: ${msg}`), { busy: true });
  return new Error(`Kling ${model} HTTP ${status} (${code || '-'}): ${msg}`);
}


const cancelledError = () => Object.assign(new Error('cancelled'), { cancelled: true });

/** A request that survives a dropped connection ("fetch failed"): retried, then the error is thrown. */
async function tolerant(fn, { tries = 5, waitMs = 4000, logFn = () => {}, what = 'istek' } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e?.cancelled || i >= tries) throw e;
      logFn(`Kling ${what}: bağlantı koptu (${e?.cause?.code || e?.message}), ${i}. yeniden deneme`);
      await sleep(waitMs * i);
    }
  }
}

/**
 * One image → one silent clip. `image` = base64 (a data: prefix is stripped). Returns the mp4 bytes.
 *
 * `taskId` (the caller's cache key) makes the task findable again: a run that died after Kling took
 * the job (and the money) finds the same task on the next run and downloads it instead of paying
 * twice. A failed task gets a fresh id (`-r1`, `-r2`). A dropped connection is retried; busy answers
 * (concurrency / rate limit) wait up to `busyWaitMs`; a used-up pack throws `quota: true` at once.
 */
export async function klingImageToVideo({ key, image, prompt, negative = '', duration = 5, resolution = '1080p', model = KLING_MODEL, taskId = '', fetchFn = (...a) => fetch(...a), logFn = () => {}, timeoutMs = 12 * 60e3, busyWaitMs = 6 * 60e3, pollMs = 5000, retryWaitMs = 4000, isCancelled = () => false }) {
  if (!key) throw new Error('Kling anahtarı yok — Ayarlar\'dan ekleyin');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const base = taskId || `nova-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const net = (what) => ({ logFn, what, waitMs: retryWaitMs });
  const find = (id) => tolerant(async () => {
    const r = await fetchFn(`${KLING_API}/tasks?external_task_ids=${encodeURIComponent(id)}`, { headers });
    const j = await r.json().catch(() => null);
    if (!r.ok || Number(j?.code) !== 0 || !Array.isArray(j?.data)) return null;
    return j.data.find((x) => x.external_id === id) || null;
  }, net('durum'));

  let t = null;
  let id = base;
  for (let n = 0; !t && n < 3; n++) {
    id = n ? `${base}-r${n}` : base;
    const seen = taskId ? await find(id) : null;
    if (seen && seen.status !== 'failed') { t = seen; logFn(`Kling: önceki görev bulundu (${seen.status}), yeniden ödenmiyor`); break; }
    if (seen) continue;
    const body = JSON.stringify(klingBody({ image, prompt, negative, duration, resolution, externalId: id, model }));
    const until = Date.now() + busyWaitMs;
    while (!t) {
      if (isCancelled()) throw cancelledError();
      let r, j;
      try {
        r = await fetchFn(`${KLING_API}/image-to-video/${model}`, { method: 'POST', headers, body });
        j = await r.json().catch(() => null);
      } catch (e) {
        // The answer was lost, not necessarily the task: look it up before asking (and paying) again.
        logFn(`Kling gönderim: bağlantı koptu (${e?.cause?.code || e?.message}), görev aranıyor`);
        await sleep(retryWaitMs);
        t = await find(id);
        if (t || Date.now() > until) { if (!t) throw e; break; }
        continue;
      }
      if (r.ok && Number(j?.code) === 0 && j?.data?.id) { t = { ...j.data, external_id: id }; break; }
      const e = klingError(r.status, j, model);
      if (!e.busy || Date.now() > until) throw e;
      logFn(`Kling meşgul (aynı anda en çok birkaç klip), 15 sn bekleniyor`);
      await sleep(15000);
    }
  }
  if (!t) throw new Error(`Kling ${model}: görev üç denemede de başarısız`);

  const started = Date.now();
  while (!['succeeded', 'failed'].includes(t.status)) {
    if (isCancelled()) throw cancelledError();
    if (Date.now() - started > timeoutMs) throw new Error(`Kling ${model}: zaman aşımı (${id})`);
    await sleep(pollMs);
    const row = await find(id).catch(() => null);
    if (row?.status) t = row;
  }
  if (t.status !== 'succeeded') {
    const msg = String(t.message || 'failed');
    throw Object.assign(new Error(`Kling ${model}: ${msg.slice(0, 200)}`), { moderation: /risk|policy|sensitive|security|violat/i.test(msg) });
  }
  const url = (t.outputs || []).find((o) => o.type === 'video' && o.url)?.url;
  if (!url) throw new Error(`Kling ${model}: video adresi dönmedi`);
  const buf = await tolerant(async () => {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`Kling klibi indirilemedi (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }, net('indirme'));
  logFn(`Kling klip hazır (${((Date.now() - started) / 1000).toFixed(0)} sn, ${model} ${resolution}, ${klingDuration(duration, model)} sn × ${klingUnitsPerSecond(resolution, model)} birim)`);
  return buf;
}
