import express from "express";
import { settingsPatch } from "./src/settings-input.js";
import { studioRouter } from "./src/studio-api.js";
import { isJobEditing } from './src/job-locks.js';
import { safeJobFileName } from './src/job-files.js';
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { ROOT, HOME, DATA_DIR, PREVIEW_DIR, readJson, writeJson } from "./src/util.js";
import { getSettings, saveSettings, publicSettings, THEMES, TONES, DURATIONS, VOICES, VISUAL_STYLES, audioLibraryInfo, audioLibraryDir } from "./src/config.js";
import { RATIOS } from "./src/pipeline/canvas.js";
import { sseHandler } from "./src/bus.js";
import { loadAllJobs, getJob, publicJob, deleteJob, jobDir } from "./src/store.js";
import { newJobFromRequest, enqueue, continueAfterPicks, approveCost, cancelJob, awaitJobStopped, killAll, queueSnapshot, sweepStaleJobs, sweepIntermediate } from "./src/pipeline/index.js";
import { previewVoice } from "./src/pipeline/voice.js";
import { docuEngineDir, docuMusicSource } from "./src/pipeline/docu.js";
import { docuElevenEstimate } from "./src/pipeline/docu-script.js";
import { searchQuery } from "./src/pipeline/media.js";
import { callJSON } from "./src/llm.js";

const app = express();
// CSV JSON escaping can expand a validated 5 MB source by up to six times.
app.use('/api/jobs/:id/audience', express.json({ limit: '32mb' }));
app.use(express.json({ limit: "4mb" }));
app.use((err,req,res,next)=>{
  if(err.type==='entity.parse.failed')return res.status(400).json({error:'Geçersiz JSON isteği.'});
  if(err.type==='entity.too.large')return res.status(413).json({error:'İstek çok büyük. CSV dosyası en fazla 5 MB olabilir.'});
  next(err);
});
app.use(express.static(path.join(ROOT, "public")));

// İş kimliği newId() formatındadır: 20260805-a1b2c3. Doğrulanmazsa "../../.." gibi bir
// değer path.join ile jobs klasörünün dışına çıkar ve deleteJob orayı özyinelemeli siler.
const ID_RE = /^\d{8}-[0-9a-f]{6}$/;
function validId(req, res, next) {
  if (!ID_RE.test(String(req.params.id || ""))) return res.status(400).json({ error: "geçersiz iş kimliği" });
  next();
}
app.param("id", (req, res, next) => validId(req, res, next));
app.use('/api/jobs/:id', studioRouter);

const PORT = Number(process.env.NOVA_PORT) || 4545;

// açılış: yarım kalan işleri temizle
sweepStaleJobs(loadAllJobs());

// ---------- durum ----------

app.get("/api/state", (req, res) => {
  res.json({
    settings: publicSettings(),
    jobs: loadAllJobs().map(publicJob),
    queue: queueSnapshot(),
    presets: {
      themes: Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, { name: v.name, desc: v.desc }])),
      tones: Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, v.name])),
      durations: DURATIONS,
      voices: VOICES,
      visualStyles: VISUAL_STYLES,
      ratios: RATIOS,
    },
  });
});

app.get("/api/events", sseHandler);

app.post("/api/settings", (req, res) => {
  try {
    saveSettings(settingsPatch(req.body));
    res.json({ ok: true, settings: publicSettings() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- işler ----------

app.post("/api/jobs", (req, res) => {
  try {
    const job = newJobFromRequest(req.body);
    enqueue(job);
    res.json({ ok: true, job: publicJob(job) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const j = getJob(req.params.id);
  if (!j) return res.status(404).json({ error: "bulunamadı" });
  res.json(publicJob(j));
});

app.get("/api/jobs/:id/candidates", (req, res) => {
  const j = getJob(req.params.id);
  if (!j) return res.status(404).json({ error: "bulunamadı" });
  const dir = jobDir(j.id);
  res.json({
    job: publicJob(j),
    script: readJson(path.join(dir, "script.json")),
    candidates: readJson(path.join(dir, "candidates.json"), {}),
    picks: readJson(path.join(dir, "picks.json"), {}),
    // Seçim ekranı hangi görselin konuyla ilgisiz olduğunu göstersin diye:
    // beatId -> {puan 0-3, gorunen}. Ön denetim çalışmadıysa boş gelir.
    denetim: readJson(path.join(dir, "denetim.json"), {}),
  });
});

app.post("/api/jobs/:id/picks", (req, res) => {
  try {
    continueAfterPicks(req.params.id, req.body.picks || {});
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post("/api/jobs/:id/cost", (req, res) => {
  try {
    approveCost(req.params.id, !!req.body.approved);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  cancelJob(req.params.id);
  res.json({ ok: true });
});

app.delete("/api/jobs/:id", async (req, res) => {
  try {
    if(isJobEditing(req.params.id)) return res.status(409).json({error:'Düzenleme işlemi sürüyor; tamamlanmasını bekleyin.'});
    cancelJob(req.params.id);
    // ffmpeg dosyaları hâlâ açık tutuyorsa Windows'ta rmSync EBUSY verir → önce bırakmasını bekle
    await awaitJobStopped(req.params.id);
    await deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// güvenli dosya sunumu (video oynatma, thumbnail, seo, srt, sahne kanıtları)
app.get("/api/jobs/:id/file/:name", (req, res) => {
  const { id, name } = req.params;
  if (!safeJobFileName(name)) return res.status(403).end();
  const file = path.join(jobDir(id), name);
  if (!fs.existsSync(file)) return res.status(404).end();
  if (req.query.dl) res.setHeader("Content-Disposition", `attachment; filename="${id}-${name}"`);
  res.sendFile(file);
});

// kapak varyantını varsayılan yap (thumbnail.jpg'nin üzerine kopyalar)
app.post("/api/jobs/:id/thumbnail", (req, res) => {
  const job=getJob(req.params.id);
  if(!job) return res.status(404).json({error:'İş bulunamadı.'});
  if(isJobEditing(job.id)||['running','queued','awaiting_picks','awaiting_cost'].includes(job.status)) return res.status(409).json({error:'İş sürüyor; kapak seçmek için tamamlanmasını bekleyin.'});
  const name = String(req.body.name || "");
  if (!/^thumb_[abc]\.jpg$/.test(name)) return res.status(400).json({ error: "geçersiz kapak adı" });
  const src = path.join(jobDir(req.params.id), name);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "kapak bulunamadı" });
  fs.copyFileSync(src, path.join(jobDir(req.params.id), "thumbnail.jpg"));
  const recipeFile=path.join(jobDir(req.params.id),'cover.json');
  writeJson(recipeFile,{...readJson(recipeFile,{}),selected:name,updatedAt:new Date().toISOString()});
  res.json({ ok: true });
});

// SHORTS — bitmiş belgeselden dikey 40-58 sn'lik Shorts (src/pipeline/docu-shorts.js).
const shortsBusy = new Set();
const shortMetas = (id) => {
  const dir = path.join(jobDir(id), "shorts");
  try {
    return fs.readdirSync(dir).filter((f) => /^short-\d{12}\.json$/.test(f)).sort().reverse()
      .map((f) => ({ ...readJson(path.join(dir, f), {}), name: f.replace(/\.json$/, ".mp4") }))
      .filter((m) => fs.existsSync(path.join(dir, m.name)));
  } catch { return []; }
};
app.get("/api/jobs/:id/shorts", (req, res) => {
  if (!getJob(req.params.id)) return res.status(404).json({ error: "İş bulunamadı." });
  res.json({ busy: shortsBusy.has(req.params.id), shorts: shortMetas(req.params.id).map(({ file, source, ...m }) => m) });
});
app.post("/api/jobs/:id/shorts", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "İş bulunamadı." });
  if (job.mediaKind !== "docu" || job.status !== "done") return res.status(409).json({ error: "Shorts yalnızca tamamlanmış belgeseller için." });
  if (shortsBusy.has(job.id)) return res.status(409).json({ error: "Bu video için Shorts zaten hazırlanıyor." });
  shortsBusy.add(job.id);
  try {
    const { makeDocuShort } = await import("./src/pipeline/docu-shorts.js");
    const settings = getSettings();
    const ffmpeg = settings.ffmpegPath || "ffmpeg";
    const m = await makeDocuShort({ jobDir: jobDir(job.id), settings, ffmpeg, title: job.meta?.title || job.topic });
    res.json({ ok: true, short: { ...m, name: path.basename(m.file), file: undefined, source: undefined } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
  } finally {
    shortsBusy.delete(job.id);
  }
});
app.get("/api/jobs/:id/short/:name", (req, res) => {
  const { id, name } = req.params;
  if (!/^short-\d{12}\.mp4$/.test(name)) return res.status(403).end();
  const file = path.join(jobDir(id), "shorts", name);
  if (!fs.existsSync(file)) return res.status(404).end();
  if (req.query.dl) res.setHeader("Content-Disposition", `attachment; filename="${id}-${name}"`);
  res.sendFile(file);
});

// GÜNDEM RADARI (src/pipeline/trend-radar.js): şu an en çok aranan konular, kanallara uygunluk ve
// Nepal ölçüsüyle (16,7 bin aboneli kanalın 4 milyon izlenen "Explained" videosu) büyüklük kıyası.
const trendCache = new Map(); // geo -> {at, items}
app.get("/api/trends", async (req, res) => {
  const geo = /^[A-Z]{2}$/.test(String(req.query.geo || "")) ? req.query.geo : "US";
  try {
    const c = trendCache.get(geo);
    if (c && Date.now() - c.at < 10 * 60e3) return res.json({ geo, items: c.items, cached: true });
    const { fetchTrending } = await import("./src/pipeline/trend-radar.js");
    const items = await fetchTrending({ geo });
    trendCache.set(geo, { at: Date.now(), items });
    res.json({ geo, items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 200) });
  }
});
app.post("/api/trends/evaluate", async (req, res) => {
  const geos = (Array.isArray(req.body?.geos) ? req.body.geos : ["US", "GB"]).filter((g) => /^[A-Z]{2}$/.test(g)).slice(0, 3);
  try {
    const { fetchTrending, fetchHeadlines, evaluateTrending, compareInterest, DEFAULT_BENCHMARK } = await import("./src/pipeline/trend-radar.js");
    const all = (await Promise.all(geos.map((geo) => fetchTrending({ geo }).catch(() => [])))).flat();
    const headlines = (await Promise.all(geos.slice(0, 2).map((geo) => fetchHeadlines({ geo }).catch(() => [])))).flat();
    const picks = await evaluateTrending({ items: all, headlines, settings: getSettings(), usage: { input: 0, output: 0 } });
    // Bigness on one scale: the top picks against the benchmark, in the channel's main market.
    const cmp = await compareInterest(picks.slice(0, 4).map((p) => p.searchTerm), { geo: geos[0] || "US" });
    for (const p of picks) {
      const c = cmp?.find((x) => x.term === p.searchTerm);
      if (c) Object.assign(p, { interest: c.peak, interestLast: c.last, vsBenchmark: c.vsBenchmark, rising: c.rising });
    }
    // Measured bigness first: the stories that rival the benchmark lead the list.
    picks.sort((x, y) => (y.vsBenchmark ?? -1) - (x.vsBenchmark ?? -1));
    res.json({ benchmark: { ...DEFAULT_BENCHMARK, peak: cmp?.[0]?.peak ?? null }, picks });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 300) });
  }
});

// BAĞIMSIZ SHORTS — uzun videoya bağlı olmayan, kendi konusunda dikey Shorts
// (src/pipeline/docu-short-standalone.js): araştırma, plan, gerçek görseller (Commons/arşiv) ya da
// AI, açılış ve seçilen cümleler Replicate ile hareketli, kütüphaneden müzik. data/shorts/<konu>/.
const STANDALONE_DIR = path.join(DATA_DIR, "shorts");
const standaloneBusy = new Map(); // slug -> {topic, log: [], startedAt}
const slugOf = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "short";
const standaloneMetas = () => {
  try {
    return fs.readdirSync(STANDALONE_DIR).map((slug) => {
      const m = readJson(path.join(STANDALONE_DIR, slug, "short.json"), null);
      return m && fs.existsSync(path.join(STANDALONE_DIR, slug, "short.mp4")) ? { ...m, slug, at: fs.statSync(path.join(STANDALONE_DIR, slug, "short.mp4")).mtimeMs } : null;
    }).filter(Boolean).sort((a, b) => b.at - a.at);
  } catch { return []; }
};
app.get("/api/shorts", (req, res) => {
  res.json({
    busy: [...standaloneBusy.entries()].map(([slug, b]) => ({ slug, topic: b.topic, log: b.log.slice(-6), startedAt: b.startedAt })),
    shorts: standaloneMetas().map(({ file, ...m }) => m),
  });
});
app.post("/api/shorts", async (req, res) => {
  const topic = String(req.body?.topic || "").trim().slice(0, 200);
  if (topic.length < 4) return res.status(400).json({ error: "Konu yazın." });
  const slug = slugOf(req.body?.slug || topic);
  if (standaloneBusy.has(slug)) return res.status(409).json({ error: "Bu konu zaten hazırlanıyor." });
  const { makeStandaloneShort, TITLE_PATTERNS, SHORT_FORMATS } = await import("./src/pipeline/docu-short-standalone.js");
  const { OPENINGS, SHORT_LOOKS } = await import("./src/pipeline/docu-shorts-looks.js");
  const prev = standaloneMetas();
  // Not chosen: rotated so the channel never falls into one opening, one title formula or one look.
  const rot = (keys, used) => keys.find((k) => !used.slice(0, Math.max(1, keys.length - 1)).includes(k)) || keys[prev.length % keys.length];
  const pick = (v, keys, used) => (keys.includes(v) ? v : rot(keys, used));
  const opening = pick(req.body?.opening, Object.keys(OPENINGS), prev.map((m) => m.opening));
  const format = pick(req.body?.format, Object.keys(SHORT_FORMATS), []);
  const titlePattern = pick(req.body?.titlePattern, Object.keys(TITLE_PATTERNS), prev.map((m) => m.titlePattern));
  const look = SHORT_LOOKS[req.body?.look] ? req.body.look : null;
  const entry = { topic, log: [], startedAt: Date.now() };
  standaloneBusy.set(slug, entry);
  res.status(202).json({ ok: true, slug, opening, format, titlePattern, look: look || "otomatik" });
  try {
    const settings = getSettings();
    await makeStandaloneShort({
      topic, angle: String(req.body?.angle || "").slice(0, 500), opening, format, titlePattern, look, recentLooks: prev.slice(0, 2).map((m) => m.look),
      voiceId: /^[A-Za-z0-9]{10,40}$/.test(String(req.body?.voiceId || "")) ? req.body.voiceId : null,
      dir: path.join(STANDALONE_DIR, slug), settings, usage: { input: 0, output: 0 },
      logFn: (m) => { entry.log.push(String(m)); if (entry.log.length > 200) entry.log.shift(); },
      ffmpeg: settings.ffmpegPath || "ffmpeg", libraryRoot: audioLibraryDir(settings),
    });
  } catch (e) {
    entry.log.push(`HATA: ${String(e?.message || e).slice(0, 300)}`);
    writeJson(path.join(STANDALONE_DIR, slug, "error.json"), { at: new Date().toISOString(), error: String(e?.message || e).slice(0, 500), log: entry.log.slice(-20) });
  } finally {
    standaloneBusy.delete(slug);
  }
});
app.get("/api/shorts/:slug/video", (req, res) => {
  const slug = slugOf(req.params.slug);
  const file = path.join(STANDALONE_DIR, slug, "short.mp4");
  if (!fs.existsSync(file)) return res.status(404).end();
  if (req.query.dl) res.setHeader("Content-Disposition", `attachment; filename="${slug}.mp4"`);
  res.sendFile(file);
});

app.post("/api/jobs/:id/open-folder", (req, res) => {
  const dir = jobDir(req.params.id);
  if (fs.existsSync(dir)) spawn("explorer", [dir], { detached: true });
  res.json({ ok: true });
});

/**
 * Anahtar testi — "kayıtlı" olması çalıştığı anlamına gelmiyor. Her sağlayıcının
 * EN UCUZ salt-okunur ucuna gerçek bir istek atar. Hiçbiri üretim tetiklemez.
 */
const KEY_TESTS = {
  openai: async (k) => {
    const model=getSettings().openaiImageModel || 'gpt-image-2';
    const r=await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`,{headers:{Authorization:`Bearer ${k}`},signal:AbortSignal.timeout(15000)});
    return r.ok ? {ok:true,bilgi:'Anahtar/model erişimi doğrulandı; üretim kredisi test edilmedi.'} : {ok:false,bilgi:r.status===401?'anahtar geçersiz':`Model erişimi doğrulanamadı (HTTP ${r.status})`};
  },
  anthropic: async (k) => {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": k, "anthropic-version": "2023-06-01" },
    });
    if (r.ok) return { ok: true, bilgi: "geçerli" };
    return { ok: false, bilgi: r.status === 401 ? "anahtar geçersiz" : `HTTP ${r.status}` };
  },
  pexels: async (k) => {
    const r = await fetch("https://api.pexels.com/v1/search?query=nature&per_page=1", { headers: { Authorization: k } });
    if (r.ok) return { ok: true, bilgi: "geçerli" };
    return { ok: false, bilgi: r.status === 401 ? "anahtar geçersiz" : `HTTP ${r.status}` };
  },
  pixabay: async (k) => {
    const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(k)}&q=nature&per_page=3`);
    if (r.ok) return { ok: true, bilgi: "geçerli" };
    return { ok: false, bilgi: r.status === 400 ? "anahtar geçersiz" : `HTTP ${r.status}` };
  },
  unsplash: async (k) => {
    const r = await fetch("https://api.unsplash.com/search/photos?query=nature&per_page=1", {
      headers: { Authorization: `Client-ID ${k}` },
    });
    if (r.ok) return { ok: true, bilgi: "geçerli" };
    return { ok: false, bilgi: r.status === 401 ? "anahtar geçersiz" : `HTTP ${r.status}` };
  },
  eleven: async (k) => {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": k } });
    if (!r.ok) return { ok: false, bilgi: r.status === 401 ? "anahtar geçersiz" : `HTTP ${r.status}` };
    const s = await r.json();
    const kalan = Math.max(0, (s.character_limit || 0) - (s.character_count || 0));
    return { ok: true, bilgi: `${s.tier || "free"} plan · ${kalan.toLocaleString("tr-TR")} karakter kaldı` };
  },
  kie: async (k) => {
    // Kie'de ücretsiz salt-okunur uç yok; var olmayan bir görev sorgulanır.
    // Anahtar bozuksa 401/403, geçerliyse "görev yok" cevabı döner.
    const r = await fetch("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=nova-test-0000", {
      headers: { Authorization: `Bearer ${k}` },
    });
    if (r.status === 401 || r.status === 403) return { ok: false, bilgi: "anahtar geçersiz" };
    if (r.ok || r.status === 404) return { ok: true, bilgi: "anahtar kabul edildi" };
    return { ok: false, bilgi: `HTTP ${r.status}` };
  },
  fal: async (k) => {
    const r = await fetch("https://rest.alpha.fal.ai/tokens/", {
      method: "POST", headers: { Authorization: `Key ${k}`, "Content-Type": "application/json" }, body: "{}",
    });
    if (r.status === 401 || r.status === 403) return { ok: false, bilgi: "anahtar geçersiz" };
    return { ok: true, bilgi: "anahtar kabul edildi" };
  },
  higgs: async (k) => {
    const r = await fetch("https://api.higgsfield.ai/v1/generations/nova-test-0000", {
      headers: { Authorization: `Bearer ${k}` },
    });
    if (r.status === 401 || r.status === 403) return { ok: false, bilgi: "anahtar geçersiz" };
    return { ok: true, bilgi: "anahtar kabul edildi" };
  },
  replicate: async (k) => {
    // Hesap ucu ücretsiz ve salt-okunur; bakiye bilgisi vermiyor.
    const r = await fetch("https://api.replicate.com/v1/account", { headers: { Authorization: `Bearer ${k}` } });
    if (r.status === 401 || r.status === 403) return { ok: false, bilgi: "anahtar geçersiz" };
    if (!r.ok) return { ok: false, bilgi: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: true, bilgi: `geçerli · ${j.username || "hesap"} (bakiye replicate.com/account/billing)` };
  },
  kling: async (k) => {
    // Kaynak paketi sorgusu ücretsiz (QPS ≤ 1): anahtar + kalan birim.
    const now = Date.now();
    const r = await fetch(`https://api-singapore.klingai.com/account/costs?start_time=${now - 365 * 864e5}&end_time=${now}`, { headers: { Authorization: `Bearer ${k}` } });
    if (r.status === 401 || r.status === 403) return { ok: false, bilgi: "anahtar geçersiz" };
    const j = await r.json().catch(() => null);
    if (!r.ok || Number(j?.code) !== 0) return { ok: false, bilgi: `HTTP ${r.status} ${j?.message || ""}`.trim() };
    const live = (j.data?.resource_pack_subscribe_infos || []).filter((p) => p.status === "online");
    const left = live.reduce((a, p) => a + (Number(p.remaining_quantity) || 0), 0);
    return { ok: true, bilgi: live.length ? `geçerli · ${left} birim kaldı (~${Math.floor(left / 4)} açılış klibi, 5 sn Kling 3.0 1080p)` : "geçerli · aktif paket yok (klingai.com → API → paket al)" };
  },
  europeana: async (k) => {
    // reusability=open ile sorulur: hem anahtarı hem TİCARİ KULLANILABİLİR
    // sonuç geldiğini doğrular. Süzgeçsiz sorguda dönenlerin çoğu
    // "yalnızca eğitim amaçlı" çıkıyor (ölçüldü: 20 sonucun 17'si).
    const u = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(k)}` +
      `&query=test&rows=1&media=true&reusability=open`;
    const r = await fetch(u);
    if (r.status === 401) return { ok: false, bilgi: "anahtar geçersiz" };
    if (!r.ok) return { ok: false, bilgi: `HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    if (!j?.success) return { ok: false, bilgi: "anahtar reddedildi" };
    return { ok: true, bilgi: `çalışıyor · ${Number(j.totalResults || 0).toLocaleString("tr-TR")} serbest kullanımlı eser` };
  },
};
const KEY_FIELD = {
  anthropic: "anthropicKey", pexels: "pexelsKey", pixabay: "pixabayKey", unsplash: "unsplashKey",
  eleven: "elevenKey", kie: "kieKey", fal: "falKey", higgs: "higgsKey",
  europeana: "europeanaKey", openai: "openaiKey", replicate: "replicateKey", kling: "klingKey",
};

// Sinematik Belgesel vitrin senaryosu (docu-engine/videos/belgesel.json).
app.get("/api/docu/sample", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(docuEngineDir(), "videos", "belgesel.json"), "utf8")));
  } catch (e) {
    res.status(404).json({ error: "Örnek senaryo bulunamadı." });
  }
});

app.post("/api/test-key/:which", async (req, res) => {
  const which = String(req.params.which);
  const test = KEY_TESTS[which];
  if (!test) return res.status(400).json({ ok: false, bilgi: "bilinmeyen sağlayıcı" });
  const key = getSettings()[KEY_FIELD[which]];
  if (!key) return res.json({ ok: false, bilgi: "anahtar girilmemiş" });
  try {
    const sonuc = await Promise.race([
      test(key),
      new Promise((_, rej) => setTimeout(() => rej(new Error("zaman aşımı")), 20000)),
    ]);
    res.json(sonuc);
  } catch (e) {
    res.json({ ok: false, bilgi: e.message === "zaman aşımı" ? "zaman aşımı" : "bağlantı hatası" });
  }
});

// disk bakımı: bitmiş işlerin ara dosyalarını süpür (çıktılara dokunmaz)
app.post("/api/maintenance/sweep", (req, res) => {
  try {
    res.json({ ok: true, ...sweepIntermediate() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// manuel modda ek arama ("daha fazla üret")
app.get("/api/search", async (req, res) => {
  try {
    const { q, type = "image", kind = "generic" } = req.query;
    if (!q) return res.status(400).json({ error: "q gerekli" });
    res.json({ candidates: await searchQuery(String(q), String(type), String(kind)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * CANLI KREDİ DURUMU — üretime başlamadan önce elde ne var?
 *
 * İki ayrı kaynak, iki ayrı birim:
 *   ElevenLabs → karakter (1 karakter ≈ 1 kredi). 8 dk video ≈ 8-9 bin karakter.
 *   Kie AI     → kredi. Görsel üretimi buradan düşüyor.
 * Biri patlarsa diğeri yine dönsün diye ayrı ayrı yakalanıyor; kredi bilgisi
 * olmaması işi durdurmaz, sadece gösterilmez.
 */
app.get("/api/credits", async (req, res) => {
  const st = getSettings();
  const { elevenKey, kieKey } = st;
  const cikti = { eleven: null, kie: null };
  // Sinematik Belgesel'in gerçek ihtiyacı: ses + (kütüphane yoksa ya da ElevenLabs
  // bestesi seçildiyse) müzik, ortam ve efekt. Eski "8 dk ≈ 8.500 karakter" yalnızca
  // anlatımı sayıyordu; 12 dk'lık bir belgeselde müzik tek başına bunun 3-4 katı.
  const docuNeed = docuElevenEstimate(12, "tr", { musicSource: docuMusicSource(st), libraryReady: audioLibraryInfo(st).ready }).total;

  const isler = [];
  if (elevenKey) isler.push((async () => {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": elevenKey } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await r.json();
    const limit = s.character_limit || 0, used = s.character_count || 0;
    cikti.eleven = {
      tier: s.tier || "free", used, limit,
      left: Math.max(0, limit - used),
      // Kalan kaç videoya yeter? 8 dk ≈ 8.500 karakter (ölçüldü).
      videolar: Math.floor(Math.max(0, limit - used) / 8500),
      // 12 dk'lık Sinematik Belgesel başına tahmini kredi ve kalanın kaç videoya yettiği.
      docuPerVideo: docuNeed,
      docuVideolar: Math.floor(Math.max(0, limit - used) / Math.max(1, docuNeed)),
      yenilenme: s.next_character_count_reset_unix || null,
    };
  })());
  if (kieKey) isler.push((async () => {
    const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${kieKey}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const kredi = typeof d.data === "number" ? d.data : Number(d.data?.credit ?? d.data ?? 0);
    cikti.kie = { kredi, gorsel: Math.floor(kredi / 4) };   // 1 görsel ≈ 4 kredi ($0,04)
  })());

  await Promise.allSettled(isler);
  res.json(cikti);
});

// ElevenLabs ses listesi + kota (anahtar varsa)
app.get("/api/eleven-voices", async (req, res) => {
  const { elevenKey } = getSettings();
  if (!elevenKey) return res.json({ voices: [], quota: null });
  try {
    const [vr, sr] = await Promise.all([
      fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers: { "xi-api-key": elevenKey } }),
      fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": elevenKey } }).catch(() => null),
    ]);
    if (!vr.ok) throw new Error(`HTTP ${vr.status}`);
    const d = await vr.json();

    let quota = null;
    if (sr?.ok) {
      const s = await sr.json();
      quota = {
        tier: s.tier || "free",
        used: s.character_count || 0,
        limit: s.character_limit || 0,
        left: Math.max(0, (s.character_limit || 0) - (s.character_count || 0)),
      };
    }

    // Ücretsiz planda "professional" (kütüphane) sesleri API'den kullanılamaz → HTTP 402.
    // Kullanıcıya seçtirip videoyu patlatmaktansa listeden çıkar.
    const freeTier = !quota || quota.tier === "free";
    const usable = (d.voices || []).filter((v) => !freeTier || v.category !== "professional");
    const blocked = (d.voices || []).length - usable.length;

    // ElevenLabs Ses Kütüphanesi'nin öne çıkan anlatıcıları (belgesel/sesli kitap): seçilince hesaba
    // eklenir (POST /api/eleven-voices/add). Ücretsiz planda kütüphane sesi API'den kullanılamaz.
    const mine = new Set((d.voices || []).map((v) => v.voice_id));
    const library = freeTier ? [] : (await featuredNarrators(elevenKey)).filter((v) => !mine.has(v.id));
    res.json({
      quota,
      blocked,
      // Only voices verified for Eleven v4, plus Brian (user, Oct 2026: "sadece v4'ten kur, bir tek Brian
      // bırakabilirsin — v4 daha iyisi varken neden kötüsünü kullanalım"). Their preview is their v4 sample.
      voices: usable.map((v) => {
        const v4 = v4Verified(v);
        return { id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {}, v4: !!v4, preview: v4?.preview_url || v.preview_url || "" };
      }).filter((v) => v.v4 || v.id === BRIAN).sort((a, b) => Number(b.v4) - Number(a.v4)),
      library,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, voices: [], quota: null });
  }
});

/** The one v2-era voice kept beside the v4 voices (the channel's narrator so far). */
const BRIAN = "nPczCjzI2devNBz1zQrb";
let narratorCache = { at: 0, list: [] };
/** A voice's Eleven v4 verification for a language (its own v4 preview), or null. */
const v4Verified = (v, lang) => (v.verified_languages || []).find((l) => /eleven_v4/.test(l.model_id || "") && (!lang || l.language === lang)) || null;
/*
 * The library's documentary narrators VERIFIED FOR ELEVEN V4 (English + Turkish), most used first.
 * The account's own premade voices are v2-era (none is verified for v4: user, Oct 2026 — "v4'te farklı
 * sesler var, sen v3'teki sesleri koyuyorsun"). The preview is the voice's own v4 sample. Cached 6 h.
 */
async function featuredNarrators(key) {
  if (Date.now() - narratorCache.at < 6 * 3600e3 && narratorCache.list.length) return narratorCache.list;
  const out = [];
  // Documentary voices only: narration / education use cases, never comedic or character voices.
  const NARRATION = new Set(["narrative_story", "informative_educational"]);
  const COMIC = /sassy|comedic|giggl|chuckl|cheerful|quirky|cartoon|hyped|cute|kids|grandpa|asmr|romantic/i;
  const CAP = { en: 30, tr: 6 };
  for (const lang of ["en", "tr"]) {
    let n = 0;
    for (const uc of ["narrative_story", "informative_educational"]) {
      for (let page = 0; page < 3 && n < CAP[lang]; page++) {
        try {
          const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=100&page=${page}&language=${lang}&use_cases=${uc}&sort=cloned_by_count`, { headers: { "xi-api-key": key } });
          if (!r.ok) break;
          const j = await r.json();
          for (const v of j.voices || []) {
            const v4 = v4Verified(v, lang);
            if (!v4 || out.some((x) => x.id === v.voice_id)) continue;
            if (!NARRATION.has(v.use_case) || COMIC.test(`${v.name} ${v.descriptive}`)) continue;
            out.push({
              id: v.voice_id, name: v.name, library: true, v4: true, publicOwnerId: v.public_owner_id,
              labels: { language: lang, accent: v4.accent || v.accent || "", gender: v.gender || "", age: v.age || "", description: v.descriptive || "", use_case: v.use_case || "" },
              preview: v4.preview_url || v.preview_url || "", uses: v.cloned_by_count || 0,
            });
            if (++n >= CAP[lang]) break;
          }
          if (!j.has_more) break;
        } catch {
          break;
        }
      }
    }
  }
  out.sort((a, b) => b.uses - a.uses);
  narratorCache = { at: Date.now(), list: out };
  return out;
}

// A library narrator chosen in Nova is added to the user's ElevenLabs voices (the user's own click).
app.post("/api/eleven-voices/add", async (req, res) => {
  const { elevenKey } = getSettings();
  const { voiceId, publicOwnerId, name } = req.body || {};
  if (!elevenKey) return res.status(400).json({ error: "ElevenLabs anahtarı yok." });
  if (!/^[A-Za-z0-9]{10,40}$/.test(String(voiceId || "")) || !/^[A-Za-z0-9]{10,80}$/.test(String(publicOwnerId || ""))) return res.status(400).json({ error: "geçersiz ses" });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/add/${publicOwnerId}/${voiceId}`, {
      method: "POST", headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: String(name || "Narrator").slice(0, 60) }),
    });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs ${r.status}: ${t.slice(0, 200)}` });
    narratorCache = { at: 0, list: [] };
    res.json({ ok: true, voiceId: JSON.parse(t).voice_id || voiceId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/*
 * A voice reading the same documentary line, performed by the voice director, with v3 or v4 —
 * so a voice AND a model are chosen by ear. Cached per voice + model + language.
 */
const SAMPLE_LINES = {
  en: [
    { say: "In September 1890, a man stepped onto a train in Dijon.", mood: "tension" },
    { say: "When it reached Paris, he was not on it.", mood: "dread" },
    { say: "He never arrived.", mood: "dread", type: "slam" },
    { say: "For a hundred and thirty years, people have asked one question, and found no answer.", mood: "reveal" },
  ],
  tr: [
    { say: "Eylül 1890'da bir adam Dijon'da bir trene bindi.", mood: "tension" },
    { say: "Tren Paris'e vardığında, o trende değildi.", mood: "dread" },
    { say: "Hiç gelmedi.", mood: "dread", type: "slam" },
    { say: "Yüz otuz yıldır insanlar tek bir soruyu soruyor, ve hiçbir cevap bulamadı.", mood: "reveal" },
  ],
};
app.get("/api/eleven-sample/:voiceId", async (req, res) => {
  const { elevenKey } = getSettings();
  const voiceId = String(req.params.voiceId || "");
  const model = req.query.model === "eleven_v4_turbo" ? "eleven_v4_turbo" : "eleven_v4";
  const lang = req.query.lang === "tr" ? "tr" : "en";
  if (!elevenKey || !/^[A-Za-z0-9]{10,40}$/.test(voiceId)) return res.status(400).end();
  const file = path.join(PREVIEW_DIR, `eleven-sample-${voiceId}-${model}-${lang}.mp3`);
  try {
    if (!fs.existsSync(file)) {
      const { pathToFileURL } = await import("node:url");
      const { directLines } = await import(pathToFileURL(path.join(docuEngineDir(), "lib", "voice-director.mjs")).href);
      const d = directLines(SAMPLE_LINES[lang], { model });
      const text = d.map((x) => x.text).join(" ");
      const stability = /eleven_v4/.test(model) ? 0.45 : /eleven_v3/.test(model) ? 0.5 : 0.45;
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST", headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability, similarity_boost: 0.8 } }),
      });
      if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}` });
      fs.mkdirSync(PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    res.sendFile(file);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- ses önizleme ----------

app.get("/api/voice-preview/:voiceId", async (req, res) => {
  try {
    const vid = req.params.voiceId;
    if (!VOICES[vid]) return res.status(404).end();
    const file = await previewVoice(vid, PREVIEW_DIR);
    res.sendFile(file);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- fikirler ----------

app.post("/api/ideas", async (req, res) => {
  const niche = String(req.body.niche || "").trim().slice(0, 200);
  if (!niche) return res.status(400).json({ error: "Niş/konu alanı boş" });
  const st = getSettings();
  if (st.demoMode || !st.anthropicKey) {
    return res.json({
      ideas: [1, 2, 3, 4, 5].map((i) => ({
        title: `${niche} hakkında fikir ${i} (demo)`,
        hook: "Gerçek fikirler için Ayarlar'dan Anthropic API anahtarı ekleyin.",
        theme: "belgesel", durationPreset: "standart",
      })),
    });
  }
  try {
    const out = await callJSON({
      system: "Sen viral YouTube içerik stratejistisin. Türkçe yanıt ver.",
      user: `Kanal nişi/konusu: "${niche}". Bu niş için yüksek izlenme potansiyelli 8 uzun video fikri üret. Her fikir: çekici başlık, 1 cümlelik kanca (hook), uygun tema (belgesel|haber|top5|analiz|egitim|hikaye) ve süre (kisa|standart|detayli|derin|uzun).`,
      schema: {
        type: "object",
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                hook: { type: "string" },
                theme: { type: "string", enum: ["belgesel", "haber", "top5", "analiz", "egitim", "hikaye"] },
                durationPreset: { type: "string", enum: ["kisa", "standart", "detayli", "derin", "uzun"] },
              },
              required: ["title", "hook", "theme", "durationPreset"],
              additionalProperties: false,
            },
          },
        },
        required: ["ideas"],
        additionalProperties: false,
      },
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- sağlık ----------

app.get("/api/health", (req, res) => {
  const st = getSettings();
  // spawn başarısız olursa Node hem 'error' hem 'close' yayar. İki kez res.json()
  // çağırmak ERR_HTTP_HEADERS_SENT fırlatır ve gömülü modda Electron'u çökertir.
  let sent = false;
  const reply = (ffmpeg, code = null) => {
    if (sent) return;
    sent = true;
    res.json({ ffmpeg, node: process.version, ffmpegPath: st.ffmpegPath, code, home: HOME });
  };
  try {
    const check = spawn(st.ffmpegPath, ["-version"], { windowsHide: true });
    let ok = false;
    check.stdout?.on("data", () => (ok = true));
    check.on("error", (e) => reply(false, e.code || "SPAWN_HATASI"));
    check.on("close", () => reply(ok, ok ? null : "CIKTI_YOK"));
    setTimeout(() => reply(false, "ZAMAN_ASIMI"), 8000).unref?.();
  } catch (e) {
    reply(false, e.code || "SPAWN_HATASI");
  }
});

const server = app.listen(PORT, "127.0.0.1", () => {
  if (process.env.NOVA_EMBEDDED) console.log(`Nova Stüdyo sunucusu hazır (:${PORT})`);
  else console.log(`\n  Nova Stüdyo hazır → http://localhost:${PORT}\n`);
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  HATA: ${PORT} portu kullanımda. Nova Stüdyo zaten açık olabilir.\n`);
  } else {
    console.error("Sunucu hatası:", e);
  }
  // Electron içinde çalışırken process.exit() TÜM uygulamayı sessizce öldürür
  // (pencere hiç açılmaz). Kabuk katmanı hatayı kendi ele alır.
  if (!process.env.NOVA_EMBEDDED) process.exit(1);
});

// Kapanışta ffmpeg alt süreçlerini kes — yoksa Windows'ta arkada çalışmaya devam ederler.
// Electron kabuğu bunu before-quit'te çağırır; tarayıcı modunda Ctrl+C yakalanır.
globalThis.__novaKillAll = killAll;
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try { killAll(); } catch {}
  try { server.close(); } catch {}
  if (!process.env.NOVA_EMBEDDED) setTimeout(() => process.exit(0), 300).unref();
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, shutdown);
process.on("exit", () => { try { killAll(); } catch {} });

export { app, server, shutdown };
