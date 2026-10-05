// SİNEMATİK BELGESEL MODU (mediaKind: "docu")
//
// Akış: araştırma → sahne senaryosu (docu-script.js) → uzunluk ve kredi kapısı →
// SEO → arşiv → docu-engine.
// Görseller: "Arşiv ağırlıklı" modda önce gerçek arşiv fotoğrafı (docu-archive.js),
// kalan sahneler ve "Sadece AI" modda hepsi GPT Image (OpenAI) ya da Replicate
// FLUX ile — tutarlı karakter + 2.5D derinlik (derinlik Replicate ister).
// docu-engine v3 performanslı seslendirmeyi, müziği (ses kütüphanesinden ya da
// ElevenLabs bestesi), efektleri ve ortam seslerini kurar ve Remotion ile render eder.
//
// Motor ayrı bir süreçte koşar: Electron ikilisi ELECTRON_RUN_AS_NODE=1 ile düz
// Node gibi çalıştırılır. Remotion kendi Chrome'unu ve kodlayıcısını açar; ana
// süreçte çökse arayüzü de götürürdü. İptal = süreç ağacını kesmek (ProcKiller).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { getJobSettings, audioLibraryInfo, audioLibraryDir } from "../config.js";
import { DATA_DIR, ROOT, readJson, writeJson } from "../util.js";
import { updateJob, log, getJob } from "../store.js";
import { runResearch } from "./script.js";
import { runDocuScript, novaView, DOCU_GENRES, docuScriptStats, docuElevenNeed, dedupeNameCards, stripChapterCards, LENGTH_GATE } from "./docu-script.js";
import { checkpoint, renderRevision, publishRevision, validScript, readCheckpoint, invalidateCheckpoints } from "./checkpoints.js";
import { renderSeoMarkdown } from "./seo.js";
import { atmosphereFootage, openingMotionTargets, resolveArchive } from "./docu-archive.js";
import { directEdit, sanitizeDevices, placeAnnotations } from "./docu-edit-director.js";
import { artDirect, applyArtPlan } from "./docu-art-director.js";
import { topicBible, applyTopicPlan } from "./docu-topic-bible.js";
import { qaVideo, QA_VERSION, invalidateArchivePicks, applyQaRejections } from "./docu-qa.js";
import { runDocuPackage, renderWithEngine } from "./docu-package.js";
import { designGate, stillScript, stillAssets } from "./docu-design-gate.js";
import { auditEra, applyEraRejections, eraRejectedUrls, eraAiOnly, readEraFixes } from "./docu-era-audit.js";
import { hikayeDonemi, sceneEras } from "./docu-archive.js";
import { claudeSpendUsd } from "../llm.js";

/**
 * Elle artırılan sürüm: motorun ÇIKTI SÖZLEŞMESİ değişince (ör. bölüm kartları).
 * Kod değişiklikleri ayrıca docuEngineFingerprint ile render anahtarına girer —
 * eskiden yalnızca bu sabit vardı, motor düzeltilince "Yeniden render" eski
 * videoyu anında geri veriyordu.
 */
export const DOCU_ENGINE_VERSION = "docu-engine-3";

/** Motor bu kadar süre tek satır yazmazsa takıldı sayılır (müzik bestesi ve mastering dahil en uzun sessiz aşamalar birkaç dakika). */
const STALL_MS = 25 * 60 * 1000;

/** Türkçe varsayılan anlatıcı (Musa) ve İngilizce için George. */
// Brian: the one v2-era voice kept beside the v4-verified voices (the others are not offered any more).
const DEFAULT_VOICE = { tr: "nPczCjzI2devNBz1zQrb", en: "nPczCjzI2devNBz1zQrb" };

export function docuEngineDir() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine");
  if (packaged && fs.existsSync(path.join(packaged, "bin", "nova-run.mjs"))) return packaged;
  return path.join(ROOT, "docu-engine");
}

/**
 * Motor kodunun parmak izi: lib/ + bin/ + src/ (geliştirmede) ya da paketli
 * derlemenin .srchash'i. Render anahtarına girer: motor düzelince kayıtlı
 * görsel/ses yeniden ödenmeden, yalnızca render tekrarlanır.
 */
export function docuEngineFingerprint(engine = docuEngineDir()) {
  const h = crypto.createHash("sha1");
  const add = (dir, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) add(p, `${rel}${e.name}/`);
      else if (e.isFile()) h.update(`${rel}${e.name}\0`).update(fs.readFileSync(p));
    }
  };
  add(path.join(engine, "lib"), "lib/");
  add(path.join(engine, "bin"), "bin/");
  if (fs.existsSync(path.join(engine, "src"))) add(path.join(engine, "src"), "src/");
  else {
    try { h.update(fs.readFileSync(path.join(engine, "build", "bundle", ".srchash"))); } catch { h.update("no-bundle"); }
  }
  return h.digest("hex").slice(0, 16);
}

/** Belgesel müziği: "library" (varsayılan, kredi harcamaz) | "eleven" (her videoya özel beste). */
export function docuMusicSource(settings) {
  return settings?.docuMusicSource === "eleven" ? "eleven" : "library";
}

/** Hazır senaryoyla başlayan iş Claude'a yalnızca SEO için gider; o adım zaten isteğe bağlı. */
export function docuMissingKeys(settings, { seeded = false } = {}) {
  const missing = [];
  if (!settings.anthropicKey && !seeded) missing.push("Anthropic");
  if (!settings.elevenKey) missing.push("ElevenLabs");
  // Görsel için biri yeter: GPT Image (OpenAI) varsayılan, Replicate yedek.
  if (!settings.openaiKey && !settings.replicateKey) missing.push("OpenAI (GPT Image) veya Replicate");
  return missing;
}

/** GPT Image varsa o, yoksa Replicate FLUX; ayar ("docuImageProvider") ikisini de zorlayabilir. */
export function docuImageProvider(settings) {
  if (settings.docuImageProvider === "replicate" && settings.replicateKey) return "replicate";
  if (settings.docuImageProvider === "openai" && settings.openaiKey) return "openai";
  return settings.openaiKey ? "openai" : "replicate";
}

/** Süreç ağacını kes (Remotion'ın Chrome'u ve ffmpeg çocukları dahil). */
function killTree(p) {
  if (process.platform === "win32" && p.pid) {
    try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }); } catch {}
  }
  try { p.kill("SIGKILL"); } catch {}
}

/**
 * Motoru alt süreçte çalıştırır. stdout'taki her JSON satırı bir olaydır
 * (log/progress/done/error); JSON olmayan satırlar (Remotion'ın kendi indirme
 * mesajı gibi) günlüğe düz yazılır.
 * @param minSeconds  seslendirmeden sonra ölçülen süre bunun altındaysa motor
 *                    müziğe geçmeden durur (0 = denetim yok, hazır senaryolar)
 * @param stallMs     bu kadar sessizlikte motor takıldı sayılır ve kesilir
 */
export function runDocuEngine({ scriptPath, workDir, output, srt, thumbnail, voiceId, settings, killer, onLog, onProgress, minSeconds = 0, stallMs = STALL_MS, prepareOnly = false, keepChunks }) {
  const engine = docuEngineDir();
  // Remotion Chrome'u "en yakın package.json'ın node_modules/.remotion" klasörüne
  // indirir. Paketli uygulamada motor klasörü salt-okunur kabul edilir; bu yüzden
  // süreç yazılabilir bir çalışma klasöründe başlatılır.
  // Chrome'un iç dosyaları ~110 karakter derinlikte; veri klasörü uzun bir yoldaysa
  // Windows'un 260 karakter sınırına takılıp tarayıcı başlatılamıyor (ölçüldü:
  // ENOENT). O durumda kısa bir geçici yol kullanılır.
  const runtime = DATA_DIR.length > 100 ? path.join(os.tmpdir(), "nova-docu-runtime") : path.join(DATA_DIR, "docu-runtime");
  fs.mkdirSync(runtime, { recursive: true });
  const pkg = path.join(runtime, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{"private":true}\n');
  const spec = path.join(workDir, "spec.json");
  writeJson(spec, {
    scriptPath, workDir, output, srt, thumbnail, voiceId,
    // Anlatım modeli: Eleven v4 (ses yönetmeni satır satır tonlar — docu-engine/lib/voice-director.mjs).
    voiceModel: settings.docuVoiceModel === "eleven_v4_turbo" ? "eleven_v4_turbo" : "eleven_v4",
    imageProvider: docuImageProvider(settings),
    openaiImageModel: settings.openaiImageModel || "gpt-image-2",
    // Açılış hareketi modeli; 2.5D derinlik katmanları sahne başına ücretli Replicate çağrısı — yalnızca ayar açıksa.
    videoModel: settings.replicateVideoModel || undefined,
    // Kling anahtarı varsa açılış hareketi doğrudan Kling 3.0 1080p (Replicate'in yerine).
    klingOpeningModel: settings.klingOpeningModel || undefined,
    klingOpeningResolution: settings.klingOpeningResolution || undefined,
    depthLayers: settings.docuDepthLayers === true,
    cacheDir: path.join(DATA_DIR, "docu-cache"),
    ffmpeg: settings.ffmpegPath || "ffmpeg",
    concurrency: 4,
    // 4 sekme: fazlası kazandırmıyor, klipli videoda bellek yüzünden yavaşlatıyor (ölçüldü: 6 sekmede %50 yavaş).
    // Each Chrome tab holds ~0.5-1 GB: on a 16 GB PC four tabs next to the user's
    // own apps filled RAM and froze the machine. Two tabs there; four from 32 GB.
    renderConcurrency: settings.docuRenderConcurrency || Number(process.env.NOVA_RENDER_CONCURRENCY) || (os.totalmem() >= 30e9 ? 4 : 2),
    minSeconds: Math.max(0, Math.round(minSeconds || 0)),
    // Hazırlık modu: render hariç her şey (görsel, klip, ses, müzik, ses tasarımı).
    planOnly: !!prepareOnly,
    // Otomatik kalite düzeltmesi için: render parçaları temiz render'dan sonra da saklanır.
    ...(typeof keepChunks === "boolean" ? { keepChunks } : {}),
  });
  return new Promise((resolve, reject) => {
    if (killer?.cancelled) return reject(new Error("cancelled"));
    const p = spawn(process.execPath, [path.join(engine, "bin", "nova-run.mjs"), spec], {
      cwd: runtime,
      env: {
        ...process.env, ELECTRON_RUN_AS_NODE: "1",
        NOVA_ELEVEN_KEY: settings.elevenKey, NOVA_REPLICATE_KEY: settings.replicateKey || "", NOVA_KLING_KEY: settings.klingKey || "", NOVA_OPENAI_KEY: settings.openaiKey || "",
        // Ses kütüphanesi (lisanslı müzik + efekt/ortam sesleri) ve müzik kaynağı.
        NOVA_AUDIO_LIB: audioLibraryDir(settings),
        NOVA_MUSIC_SOURCE: docuMusicSource(settings),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    killer?.add(p);
    // Dizgi olarak oku: Türkçe çok baytlı harf (ş, ğ, ı) iki parça arasında
    // bölünürse Buffer.toString her parçada U+FFFD üretiyordu.
    p.stdout.setEncoding("utf8");
    p.stderr.setEncoding("utf8");
    let done = null;
    let failure = null;
    let buf = "";
    let errTail = "";
    // Takılma bekçisi: kuyruk tek iş çalıştırıyor, donmuş bir Remotion/Chrome
    // arkadaki bütün videoları süresiz bekletirdi.
    let stalled = false;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; killTree(p); }, stallMs);
      timer.unref?.();
    };
    arm();
    p.stdout.on("data", (d) => {
      arm();
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { onLog?.(line); continue; }
        if (ev.type === "log") onLog?.(ev.msg);
        else if (ev.type === "progress") onProgress?.(ev.stage, ev.pct);
        else if (ev.type === "done") done = ev;
        else if (ev.type === "error") failure = ev;
      }
    });
    p.stderr.on("data", (d) => { arm(); errTail = (errTail + d).slice(-2000); });
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (killer?.cancelled) return reject(new Error("cancelled"));
      if (stalled) {
        return reject(new Error(`Sinematik motor ${Math.round(stallMs / 60000)} dakika yanıt vermedi ve durduruldu. Üretilen görsel ve sesler korunur — "Kaldığı yerden devam et" ile sürdürün.`));
      }
      if (code === 0 && done) return resolve(done);
      // Kısa mesaj kullanıcıya, yığın ve stderr günlüğe: hata ayıklamak için ikisi de gerekir.
      if (failure?.stack) onLog?.(`Motor hata ayrıntısı: ${String(failure.stack).slice(0, 1500)}`);
      if (errTail.trim()) onLog?.(`Motor stderr: ${errTail.trim().slice(-1200)}`);
      const msg = failure?.msg || errTail.trim().split("\n").slice(-3).join(" ") || `motor ${code} koduyla çıktı`;
      reject(new Error(`Sinematik motor: ${msg}`.slice(0, 600)));
    });
  });
}

/* ------------------------------------------------------------------ kapılar */

const fmt = (n) => Math.round(n).toLocaleString("tr-TR");

/**
 * Uzunluk kapısı: "10 dk" isteği 10 dakikanın altında bir videoya para
 * harcamasın. Tahmin bilerek düşük (docu-script DOCU_SEC_PER_WORD).
 */
export function assertLongEnough(docu, job) {
  const st = docuScriptStats(docu, job);
  if (st.estMinutes >= st.targetMinutes * LENGTH_GATE) return st;
  throw new Error(
    `Senaryo kısa: ~${st.estMinutes.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} dk (hedef ≥ ${st.targetMinutes} dk; ${st.actualWords}/${st.plannedWords} kelime). ` +
    `Bölümler kaydedildi — "Kaldığı yerden devam et" kısa bölümleri yeniden uzatır. Ücretli görsel/ses adımına geçilmedi.`,
  );
}

/** Motorun önbelleğinde hazır olanlar: yeniden render'da kredi ihtiyacından düşülür. */
function engineCacheState(workDir, docu) {
  let files = [];
  try { files = fs.readdirSync(path.join(workDir, "public", "build", String(docu.id))); } catch {}
  const voiced = docu.scenes.filter((s) => s.say && !s.chapterCard).length || 1;
  const metas = files.filter((f) => /^voice-.*\.json$/.test(f)).length;
  let sfx = 0;
  try { sfx = fs.readdirSync(path.join(DATA_DIR, "docu-cache", "sfx", String(docu.genre)), { recursive: true }).length; } catch {}
  return { voiceCachedFraction: Math.min(1, metas / voiced), musicCached: files.some((f) => /^music-/.test(f)), sfxPoolReady: sfx >= 10 };
}

/** Ücretsiz uç: kalan karakter kredisi. Yalnızca iş çalışırken çağrılır. */
async function elevenRemaining(key) {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const s = await r.json();
  return Math.max(0, (s.character_limit || 0) - (s.character_count || 0));
}

/**
 * ElevenLabs kredi ön denetimi — görsellerden ÖNCE. Eskiden motor önce bütün
 * görselleri (OpenAI parası) üretiyor, kredi seste ya da müzikte bitince iş
 * yarıda ölüyordu. Kredi okunamazsa uyarı yazılır ve devam edilir.
 */
async function elevenPreflight({ settings, docu, workDir, lib, log2 }) {
  const need = docuElevenNeed(docu, { musicSource: docuMusicSource(settings), libraryReady: lib.ready, ...engineCacheState(workDir, docu) });
  if (need.total <= 0) return need;
  let left;
  try { left = await elevenRemaining(settings.elevenKey); } catch (e) {
    log2(`ElevenLabs kredisi okunamadı (${e.message}); kredi ön denetimi atlandı`);
    return need;
  }
  const detail = [need.voice && `ses ${fmt(need.voice)}`, need.music && `müzik ${fmt(need.music)}`, need.ambience && `ortam ${fmt(need.ambience)}`, need.sfx && `efekt ${fmt(need.sfx)}`].filter(Boolean).join(" + ");
  log2(`ElevenLabs: ~${fmt(need.total)} kredi gerekli (${detail}), ${fmt(left)} kalan`);
  if (left < need.total * 1.1) {
    throw new Error(`ElevenLabs kredisi yetmiyor: ~${fmt(need.total)} gerekli (+%10 pay), ${fmt(left)} kalan — kredi yükleyip "Kaldığı yerden devam et". Senaryo kaydedildi, yeniden yazılmaz; görsel üretimine geçilmedi.`);
  }
  return need;
}

/* ------------------------------------------------------------------ Claude harcama tavanı */

/** Video başına varsayılan Claude tavanı (tahmini $, işin bütün çalıştırmaları toplamı). */
export const DOCU_MAX_CLAUDE_USD = 4;

/**
 * İş başına Claude harcama bekçisi. job.usage bütün çalıştırmalar boyunca birikir; tavan
 * aşılınca İSTEĞE BAĞLI adımlar (QA görme denetimi, otomatik düzeltmenin yeniden seçimi,
 * dönem denetiminin 2. turu) açık bir günlük satırıyla atlanır; zorunlu adımlar (arşiv
 * seçimi, yönetmenler, render, paket) biter. settings.docuMaxClaudeUsd: 0 = tavan yok.
 */
export function claudeGuard(usage, settings = {}, logFn = () => {}) {
  // NOVA_MAX_CLAUDE_USD overrides for batch runs (e.g. re-finishing old jobs whose past spend already exceeds the cap).
  const raw = process.env.NOVA_MAX_CLAUDE_USD ?? settings.docuMaxClaudeUsd;
  const max = raw === undefined || raw === null || raw === "" || !Number.isFinite(Number(raw)) ? DOCU_MAX_CLAUDE_USD : Math.max(0, Number(raw));
  const spent = () => claudeSpendUsd(usage, settings.modelRates || usage?.modelRates || {});
  const over = () => max > 0 && spent() >= max;
  const told = new Set();
  return {
    max, spent, over,
    /** Tavan aşıldıysa adımı atla (true döner) ve bunu bir kez günlüğe yaz. */
    skip(what) {
      if (!over()) return false;
      if (!told.has(what)) {
        told.add(what);
        logFn(`Claude harcama tavanı doldu (bu video ~$${spent().toFixed(2)} / tavan $${max.toFixed(2)}): ${what} atlandı — zorunlu adımlar sürüyor (ayar: docuMaxClaudeUsd)`);
      }
      return true;
    },
  };
}

/** Dönem denetiminin bir senaryo (docKey) için en çok düzeltme turu — devam/yeniden çalıştırma dahil. */
export const ERA_MAX_ROUNDS = 2;

/* ------------------------------------------------------------------ motor uyarıları */

const count = (v) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : v ? 1 : 0);
const scenesOf = (v) => (Array.isArray(v) && v.length && v.every((x) => Number.isInteger(x)) ? ` (sahne ${v.slice(0, 8).map((x) => x + 1).join(", ")}${v.length > 8 ? "…" : ""})` : "");
const WARN_TR = {
  fallbackImages: (v) => `${count(v)} sahnede görsel üretilemedi, yedek kare kullanıldı${scenesOf(v)}`,
  borrowed: (v) => `${count(v)} sahne komşu sahnenin görselini ödünç aldı${scenesOf(v)}`,
  missingAmbience: (v) => `${count(v)} ortam sesi eksik`,
  depthSkipped: (v) => `${count(v)} sahnede derinlik katmanı atlandı`,
  musicPromptFallback: () => "bölüm planlı müzik reddedildi, tek parça müziğe düşüldü",
  refRefused: (v) => `karakter referans portresi reddedildi: ${Array.isArray(v) ? v.join(", ") : v}`,
  slamFallback: (v) => `${count(v)} slam kelimesi sese bağlanamadı${scenesOf(v)}`,
  keywordMiss: (v) => `${count(v)} vurgu kelimesi sese bağlanamadı${scenesOf(v)}`,
};
/** Yeniden render'ın (eksik varlığı tekrar deneyerek) düzeltebileceği uyarılar. */
const DEGRADING = new Set(["fallbackImages", "borrowed", "missingAmbience", "depthSkipped", "musicPromptFallback", "refRefused"]);

/**
 * Motorun `done.warnings` alanını kullanıcı diline çevirir. Motor eskiden
 * başarısız görseli komşu kareyle, düşen ortam sesini sessizlikle geçiştirip
 * "Hazır" diyordu; artık bunlar kalite uyarısı olur ve render "eksik" işaretlenir.
 */
export function engineWarnings(w) {
  if (!w) return { messages: [], degraded: false };
  if (Array.isArray(w)) { const messages = w.map(String).filter(Boolean); return { messages, degraded: messages.length > 0 }; }
  const messages = [];
  let degraded = false;
  for (const [k, v] of Object.entries(w)) {
    if (!count(v)) continue;
    messages.push(WARN_TR[k] ? WARN_TR[k](v) : `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    if (DEGRADING.has(k)) degraded = true;
  }
  return { messages, degraded };
}

/** Kütüphaneden kurgulanan müziğin künyesi (CC-BY parçalar atıf ister). */
function musicCuesOf(res) {
  if (Array.isArray(res?.musicCues)) return res.musicCues;
  const p = res?.props;
  const s = typeof p === "string" ? readJson(p)?.script : p?.script;
  return Array.isArray(s?.musicCues) ? s.musicCues : [];
}

/* ------------------------------------------------------------------ kalite denetimi yardımcıları */

/**
 * Denetimin okuyacağı senaryo: motorun çizdiği (props: bölüm kartları, ses süreleri,
 * beats) + pipeline'ın alanları (archived). Sahne sayısı tutmazsa motora giden senaryo.
 */
export function qaScriptOf(props, ed, era) {
  const own = props?.scenes?.filter((s) => !(s?.type === "title" && s.chapterCard));
  if (!own || own.length !== ed.scenes.length) return { ...ed, era: ed.era || era };
  let k = 0;
  const scenes = props.scenes.map((s) => (s?.type === "title" && s.chapterCard ? s : { ...ed.scenes[k++], ...s }));
  return { ...props, scenes, era: props.era || ed.era || era, title: props.title || ed.title };
}

/** Motorun kendi yerleşimi (docu-engine/src/timeline.js); okunamazsa null (denetim yaklaşık hesaplar). */
async function enginePlacement(script) {
  try {
    const { placeTimeline } = await import(pathToFileURL(path.join(docuEngineDir(), "src", "timeline.js")).href);
    return placeTimeline(script.scenes, 30, script.beats ?? []).map((p) => ({ from: p.from, frames: p.frames }));
  } catch { return null; }
}

/** Otomatik düzeltme için saklanan render parçaları gerekmediğinde silinir (~2 GB). */
function dropRenderChunks(workDir) {
  const dirc = path.join(workDir, "chunks");
  try {
    for (const f of fs.readdirSync(dirc)) if (/^[va]-[\w-]+\.(mp4|wav)$/.test(f)) fs.rmSync(path.join(dirc, f), { force: true });
  } catch {}
}

/** Motor aşamaları → Nova'nın aşama şeridi ve yüzdesi (15-92 arası). */
const STAGE_OF = { images: "media", voice: "voice", music: "music", sfx: "music", ambience: "music", render: "render", master: "render" };
const LABEL = { media: "Görseller üretiliyor", voice: "Seslendirme", music: "Müzik ve ses tasarımı", render: "Render" };

export async function runDocuJob({ jobId, job, dir, usage, saveUsage, isCancelled, killer, stagePatch, cachedSeo }) {
  const log2 = (m) => log(jobId, m);
  const settings = getJobSettings(job);
  const guard = claudeGuard(usage, settings, log2);
  if (guard.spent() >= 0.01) log2(`Claude harcaması bu video için şimdiye kadar ~$${guard.spent().toFixed(2)}${guard.max > 0 ? ` (tavan $${guard.max.toFixed(2)})` : ""}`);
  const hasScript = !!readJson(path.join(dir, "docu-script.json"))?.scenes?.length || !!job.docuSeed?.scenes?.length;
  const missing = docuMissingKeys(settings, { seeded: hasScript });
  if (missing.length) throw new Error(`Sinematik Belgesel için anahtar eksik: ${missing.join(", ")}. Ayarlar'dan ekleyin.`);
  const lib = audioLibraryInfo(settings);
  const musicSource = docuMusicSource(settings);
  const quality = [];
  if (!lib.ready) {
    const m = `Ses kütüphanesi bulunamadı (${lib.dir}) — müzik ve efektler için ElevenLabs'e düşülebilir (ek kredi).`;
    log2(m);
    quality.push(m);
  } else log2(`Ses kütüphanesi: ${lib.tracks} parça, ${lib.sfx} efekt · müzik kaynağı: ${musicSource === "eleven" ? "ElevenLabs bestesi" : "kütüphane"}`);

  // 1-2) ARAŞTIRMA + SAHNE SENARYOSU (kayıtlıysa yeniden yazılmaz)
  const docuFile = path.join(dir, "docu-script.json");
  let docu = readJson(docuFile);
  // Hazır senaryoyla başlatılan iş (örnek video, dışarıdan yüklenen JSON): yazım adımı atlanır.
  if (!docu?.scenes?.length && job.docuSeed?.scenes?.length) {
    // Elle seçilen stil hazır senaryonun stilini ezer: aynı hikâye başka kurgu diliyle.
    docu = stripChapterCards({ ...job.docuSeed, ...(job.docuGenre ? { genre: job.docuGenre } : {}), id: job.id });
    writeJson(docuFile, docu);
    updateJob(jobId, { docuSeed: null });
    log2(`Hazır sinematik senaryo kullanılıyor: ${docu.scenes.length} sahne`);
  }
  if (!docu?.scenes?.length) {
    stagePatch(jobId, "research", 2, "Araştırma yapılıyor...");
    const rf = path.join(dir, "research.md");
    // Araştırma ve SEO net işler: Sonnet 5.5. Hikâye planı ve bölümler (yaratıcı, uzun) ayarlardaki modelle (Opus 5.5).
    const research = fs.existsSync(rf) ? fs.readFileSync(rf, "utf8") : await runResearch(job, usage, log2, { model: settings.docuFastModel || "claude-sonnet-5-5" });
    fs.writeFileSync(rf, research, "utf8");
    saveUsage();
    if (isCancelled()) return;
    stagePatch(jobId, "script", 8, "Sinematik senaryo yazılıyor (sahne, duygu, ses performansı)...");
    docu = await runDocuScript(job, research, usage, log2, { dir, isCancelled, eleven: { musicSource, libraryReady: lib.ready }, chapterModel: settings.docuChapterModel || "claude-sonnet-5-5" });
    saveUsage();
    if (isCancelled()) return;
    // Kısa senaryo diske "bitmiş" diye yazılmaz: devam, kayıtlı bölümleri yeniden uzatır.
    assertLongEnough(docu, job);
    writeJson(docuFile, docu);
  } else if (docu.stats?.plannedWords) {
    // Yazarın ürettiği (sonradan elle kısaltılmış olabilir) senaryo da kapıdan geçer;
    // kısaysa kenara alınır ki devam onu bölüm kayıtlarından yeniden kurup uzatsın.
    try { assertLongEnough(docu, job); } catch (e) {
      fs.renameSync(docuFile, docuFile.replace(/\.json$/, `.short-${Date.now()}.json`));
      throw e;
    }
  } else {
    // Hazır senaryo: uzunluğu kullanıcının seçimi (örnek video bilerek kısa); yalnızca bildirilir.
    const st = docuScriptStats(docu, job);
    log2(`Hazır senaryo süresi: ~${st.estMinutes.toFixed(1)} dk (${st.actualWords} kelime)`);
  }
  const stripped = stripChapterCards(docu);
  if (stripped !== docu) { docu = stripped; writeJson(docuFile, docu); log2("Senaryodaki bölüm kartları çıkarıldı (motor kendisi ekler)"); }
  // Dışarıdan gelen senaryo motorun tanımadığı bir stil taşıyabilir; render'da
  // (bütün görseller üretildikten SONRA) çökmesin diye burada düzeltilir.
  const genreIds = DOCU_GENRES.map((g) => g.id);
  if (!genreIds.includes(docu.genre)) {
    log2(`Bilinmeyen stil "${docu.genre ?? "-"}" → ${job.docuGenre || "documentary"}`);
    docu = { ...docu, genre: genreIds.includes(job.docuGenre) ? job.docuGenre : "documentary" };
    writeJson(docuFile, docu);
  }
  // Geri sayım: her maddenin sahneleri kendi dönemini taşır (arşivin dönem kuralları ve dönem denetimi maddeye göre).
  if (docu.format === "ranking" && docu.ranking?.items?.length) {
    const yearOf = new Map(docu.ranking.items.map((x) => [x.chapter, x.year]));
    docu = { ...docu, scenes: docu.scenes.map((s) => {
      const y = yearOf.get(s.chapter);
      return Number.isFinite(y) && y !== 0 ? { ...s, era: y < 0 ? `${-y} BC` : String(y) } : s;
    }) };
  }
  // Yüzyıllara yayılan hikâye (ya da bugünün haberi): sahne kendi yılıyla, yoksa bölümünün dönemiyle yargılanır.
  // Bugünü anlatan konu: haber formatı ya da konusu/yönlendirmesi bu yılı ya da geçen yılı anıyor ("October 2026").
  const thisYear = new Date().getFullYear();
  const today = job.docuFormat === "news" || [thisYear, thisYear - 1].some((y) => new RegExp(`\b${y}\b`).test(`${job.topic || ""} ${job.guidance || ""}`));
  const withEras = sceneEras(docu, { news: today, now: thisYear });
  if (withEras !== docu) { docu = withEras; writeJson(docuFile, docu); log2("Geniş zamanlı hikâye: sahneler kendi/bölüm dönemiyle arşivlenecek"); }
  for (const w of docu.stats?.warnings || []) quality.push(w);
  const script = novaView(docu);
  // Senaryo sonradan düzenlenmiş olabilir: Nova görünümü her çalıştırmada ona eşitlenir.
  if (JSON.stringify(readJson(path.join(dir, "script.json"))) !== JSON.stringify(script) && validScript(script)) {
    writeJson(path.join(dir, "script.json"), script);
    checkpoint(dir, "script", [job.topic, job.guidance], script);
  }
  updateJob(jobId, { meta: { ...(getJob(jobId).meta || {}), title: docu.title, scenes: docu.scenes.length } });
  if (isCancelled()) return;

  // 3) KREDİ ÖN DENETİMİ — ücretli görsel/ses adımlarından önce.
  const voiceId = job.elevenVoiceId || DEFAULT_VOICE[job.language] || DEFAULT_VOICE.tr;
  const workDir = path.join(dir, "docu");
  fs.mkdirSync(workDir, { recursive: true });
  await elevenPreflight({ settings, docu, workDir, lib, log2 });
  if (isCancelled()) return;

  // 4) SEO (videodan bağımsız; çökerse video yine çıkar)
  stagePatch(jobId, "seo", 13, "SEO paketi üretiliyor...");
  let seo;
  try { seo = await cachedSeo(job, script, usage, log2, dir); } catch (e) {
    if (isCancelled()) return;
    log2(`SEO tamamlanamadı: ${e.message}`);
    seo = { title: docu.title, description: "", tags: [], thumbnailText: "", incomplete: true };
  }
  saveUsage();
  if (isCancelled()) return;

  // 4b) KURGU YÖNETMENİ — her anın hak ettiği cihaz (pano, belge, alıntı, zaman çizelgesi,
  // harita, manşet, işaret). Arşivden ÖNCE: cihazın kendi görseli de aransın. Plan senaryo
  // özetine göre kayıtlı (yeniden ödenmez); kredi/anahtar yoksa iş yönetmensiz sürer.
  // docu-script.json değişmez: yönetmenin kararı her çalıştırmada kayıttan yeniden uygulanır.
  let directed = docu;
  try {
    if (settings.docuEditDirector !== false) {
      stagePatch(jobId, "media", 14, "Kurgu yönetmeni sahneleri inceliyor...");
      ({ script: directed } = await directEdit(docu, { settings, usage, logFn: log2, cacheFile: path.join(dir, "docu-edit-director.json"), isCancelled }));
      saveUsage();
    } else directed = sanitizeDevices(docu, { logFn: log2 }).script;
  } catch (e) {
    if (isCancelled()) return;
    log2(`Kurgu yönetmeni atlandı: ${String(e?.message || e).slice(0, 200)}`);
    directed = docu;
  }
  if (isCancelled()) return;

  // 4b2) KONU KİMLİĞİ — konunun kendi görsel dili (motif, fotoğraf sunumu, tipografi, açıklayıcılar,
  // metafor ikonları). Senaryo özetine göre kayıtlı; kredi yoksa belirleyici yedek. Burada yalnızca
  // betik düzeyi script.topic eklenir (sahneler — dolayısıyla arşiv anahtarı — değişmez); sahne
  // alanları arşivden SONRA uygulanır (applyTopicPlan). Sanat yönetmeni kimliğe uyar.
  let topicPlan = null;
  try {
    if (settings.docuTopicBible !== false) {
      stagePatch(jobId, "media", 14, "Konu kimliği kuruluyor...");
      const r = await topicBible(directed, { settings, usage, logFn: log2, cacheFile: path.join(dir, "docu-topic-bible.json"), isCancelled });
      topicPlan = r.bible;
      if (r.script?.topic) directed = r.script;
      saveUsage();
    }
  } catch (e) {
    if (isCancelled()) return;
    log2(`Konu kimliği atlandı: ${String(e?.message || e).slice(0, 200)}`);
    topicPlan = null;
  }
  if (isCancelled()) return;

  // 4c) SANAT YÖNETMENİ — videonun görünüm varyantı (türün son 3 videosundan farklı),
  // bölüm renk yolculuğu ve sahne başına yazı stili, zemin, renk, efekt, geçiş, kamera.
  // Plan senaryo özetine göre kayıtlı; kredi yoksa belirleyici yedek planlayıcı. Görünüm
  // alanları arşivi etkilemez: plan motora giden senaryoya arşivden SONRA uygulanır
  // (docKey ve arşiv kaydı değişmez; oran bilgisi o an bilinir).
  let artPlan = null;
  try {
    if (settings.docuArtDirector !== false) {
      stagePatch(jobId, "media", 14, "Sanat yönetmeni görünümü seçiyor...");
      ({ plan: artPlan } = await artDirect(directed, { settings, usage, logFn: log2, cacheFile: path.join(dir, "docu-art-director.json"), isCancelled }));
      saveUsage();
    }
  } catch (e) {
    if (isCancelled()) return;
    log2(`Sanat yönetmeni atlandı: ${String(e?.message || e).slice(0, 200)}`);
    artPlan = null;
  }
  if (isCancelled()) return;

  // 5) ARŞİV — "Arşiv ağırlıklı" modda gerçek fotoğraflar önce aranır.
  const publicDir = path.join(workDir, "public");
  const docKey = crypto.createHash("sha1").update(JSON.stringify(directed.scenes)).digest("hex");
  // Kalite denetiminin reddettiği kaynaklar (otomatik düzeltme): aynı senaryoya aitse uygulanır.
  const qaFixFile = path.join(dir, "docu-qa-fixes.json");
  const readFixes = () => { const f = readJson(qaFixFile, null); return f?.docKey === docKey ? f : null; };
  // Render öncesi dönem denetiminin (docu-era-audit.js) reddettikleri: adresler arşiv adımında
  // aday listesinden düşülür (aynı dönem); sahne düzeltmeleri aynı senaryoya aitse uygulanır.
  const era = hikayeDonemi(directed);
  const readEra = () => { const f = readEraFixes(dir); return f && (!f.docKey || f.docKey === docKey) ? f : null; };
  /** Arşiv + isim kartı + işaret yerleşimi → motora giden senaryo. İptalde null. */
  const prepareEngineDocu = async () => {
    let ed = directed;
    let credits = {};
    if ((job.docuSource || "archive") === "archive") {
      stagePatch(jobId, "media", 14, "Arşivde gerçek fotoğraflar aranıyor...");
      // Tamamlanmış bir arşiv geçişi aynı senaryo için yeniden yapılmaz: işe her
      // devam edildiğinde "uygun yok"/yarış kalan sahneler yeniden aranıp dakikalar
      // ve seçici ücreti harcıyordu. Senaryo değişirse anahtar değişir, yeniden aranır.
      const doneFile = path.join(dir, "docu-archive-done.json");
      const prev = readJson(doneFile, null);
      const filesOk = (s) => s.scenes.every((x) => !x.archived || fs.existsSync(path.join(publicDir, x.image)));
      if (prev?.key === docKey && prev.script?.scenes?.length && filesOk(prev.script)) {
        ({ script: ed, credits } = prev);
        log2(`Arşiv: önceki tamamlanmış geçiş kullanılıyor (${Object.keys(credits).length} gerçek fotoğraf)`);
      } else {
        // Atmosfer sahneleri (deniz, sis, gökyüzü, ateş...) önce gerçek stok klibi dener; yoksa AI resmi kalır.
        const withAtmos = structuredClone(directed);
        const atmos = atmosphereFootage(withAtmos, { max: Math.min(30, Math.round((withAtmos.scenes?.length || 0) * 0.25)) });
        if (atmos) log2(`Arşiv: ${atmos} atmosfer sahnesi önce stok video (Pexels, Pixabay, arşiv) arayacak`);
        ({ script: ed, credits } = await resolveArchive(withAtmos, {
          dir, publicDir, buildPrefix: `build/${docu.id}`,
          settings, usage, logFn: log2, isCancelled,
          rejected: eraRejectedUrls(readEraFixes(dir), era),
          // İki kez dönem dışı bulunan sahneler aranmaz (seçici ücreti yok): AI görseli, aiFix notuyla.
          aiOnly: eraAiOnly(readEra(), era),
          // 170 sahnelik bir belgeselde arşiv adımı dakikalar sürer; ilerleme görünmeli (log'a değil, yalnızca iş mesajına).
          onProgress: (d, n) => updateJob(jobId, { message: `Arşivde gerçek fotoğraflar aranıyor... ${d}/${n}` }),
        }));
        saveUsage();
        if (isCancelled()) return null;
        writeJson(doneFile, { key: docKey, script: ed, credits });
      }
    }
    ed = stripChapterCards(structuredClone(ed));
    credits = { ...credits };
    const rejectedToAi = applyQaRejections(ed, credits, readFixes(), log2);
    if (rejectedToAi) log2(`${rejectedToAi} sahne kalite denetiminin reddettiği kaynağı yeniden aldığı için AI görseline çevrildi`);
    const eraFix = applyEraRejections(ed, credits, readEra(), log2);
    if (eraFix.toAi) log2(`${eraFix.toAi} sahne/kare dönem denetiminin reddettiği kaynağı yeniden aldığı için AI görseline çevrildi`);
    // İsim kartı kişi başına bir kez — İKİ modda da ve arşivden SONRA: AI'a düşen
    // sahnenin kartı zaten silinmiş olur, ilk sağ kalan görünüş kartı taşır.
    const dupNames = dedupeNameCards(ed.scenes);
    if (dupNames) log2(`${dupNames} tekrar eden isim kartı kaldırıldı`);
    // Yönetmenin "bu adam / bu ayrıntı" işaretleri: seçilen gerçek fotoğrafta konumu bulunur.
    if (ed.scenes.some((s) => s.annotate)) {
      try {
        ({ script: ed } = await placeAnnotations(ed, { publicDir, cacheFile: path.join(dir, "docu-annotate.json"), settings, usage, logFn: log2, isCancelled, ffmpeg: settings.ffmpegPath || "ffmpeg" }));
        saveUsage();
      } catch (e) {
        if (isCancelled()) return null;
        log2(`İşaretler yerleştirilemedi (${String(e?.message || e).slice(0, 160)}); kaldırıldı`);
        ed = { ...ed, scenes: ed.scenes.map((s) => (s.annotate && !Number.isFinite(s.annotate.x) ? (({ annotate, ...rest }) => rest)(s) : s)) };
      }
    }
    // Sanat yönetmeninin görünüm planı (arşivden sonra: geniş/dikey resim oranı artık biliniyor).
    if (artPlan) {
      try { ed = applyArtPlan(ed, artPlan, { logFn: log2 }); } catch (e) { log2(`Sanat yönetmeni planı uygulanamadı: ${String(e?.message || e).slice(0, 160)}`); }
    }
    // Konu kimliğinin sahne kararları (açıklayıcı/arayüz kartı dönüşümleri, ikonlar, sunum, motif
    // geçişleri): sanat planından SONRA — sunum ve motifte incil kazanır.
    if (topicPlan) {
      try { ed = applyTopicPlan(ed, topicPlan, { logFn: log2 }); } catch (e) { log2(`Konu kimliği uygulanamadı: ${String(e?.message || e).slice(0, 160)}`); }
    }
    // Arşivde karşılanmayan her sahne AI ile üretilir; künyede bunu belirt.
    // "all": hiç arşiv fotoğrafı yoksa künye "tüm görseller AI" der, "bazı sahneler" değil.
    // Arşivlenmiş sahnenin ek detay kartı (imagePrompts) da AI ile üretilir.
    if (ed.scenes.some((sc) => sc.imagePrompts?.length || (!sc.archived && sc.imagePrompt))) credits["ai"] = { provider: "ai", file: "ai", all: !ed.scenes.some((sc) => sc.archived) };
    return { engineDocu: ed, credits };
  };
  const prep = await prepareEngineDocu();
  if (!prep || isCancelled()) return;
  let { engineDocu, credits } = prep;

  // 5b) RENDER ÖNCESİ DÖNEM DENETİMİ — hikâye ~1995'ten önceyse stok/AI/montaj kareleri
  // etiketli kontak sayfalarıyla Sonnet 5.5'e gösterilir; dönem dışı arşiv/stok seçimi
  // reddedilip yeniden seçilir (en çok 2 tur), dönem dışı AI görseli notla bir kez yeniden
  // üretilir. Kararlar görsel+dönem başına kayıtlı: aynı görsel iki kez ödenmez. Kredi yoksa iş sürer.
  if (settings.docuEraAudit !== false) {
    for (let round = 1; round <= ERA_MAX_ROUNDS; round++) {
      // Tur sayısı senaryo başına KALICI (docu-era-fixes.json rounds): eskiden her devam/yeniden
      // çalıştırma 2 tur daha açıyordu; her tur bütün arşiv geçişini yeniden tetikliyordu
      // (1929: 4 çalıştırmada 8 tur). Tavan dolduysa yeni tur açılmaz.
      const done = readEra()?.rounds || 0;
      if (done >= ERA_MAX_ROUNDS) {
        log2(`Dönem denetimi: bu senaryo için ${done} düzeltme turu zaten yapıldı — yeni tur açılmıyor`);
        break;
      }
      if ((round >= 2 || done >= 1) && guard.skip("dönem denetiminin 2. turu")) break;
      let res;
      try {
        stagePatch(jobId, "media", 14, round === 1 ? "Dönem denetimi: görseller dönemine uyuyor mu..." : "Dönem denetimi: yeniden seçilen görseller...");
        res = await auditEra({
          script: engineDocu, credits, dir, settings, usage, logFn: log2, ffmpeg: settings.ffmpegPath || "ffmpeg",
          publicDir, propsFile: path.join(workDir, `${docu.id}.props.json`), keyScript: directed, docKey, isCancelled,
        });
        saveUsage();
      } catch (e) {
        if (isCancelled()) return;
        log2(`Dönem denetimi atlandı: ${String(e?.message || e).slice(0, 200)}`);
        break;
      }
      if (isCancelled()) return;
      const a = res?.applied;
      if (!a || !(a.ids?.length || a.aiRegen)) break;
      // Yeniden seçim: yalnızca geçersiz sayılan sahneler aranır (diğerleri önbellekten, ücretsiz);
      // AI notları (aiFix) da burada motora giden senaryoya yazılır.
      const again = await prepareEngineDocu();
      if (!again || isCancelled()) return;
      ({ engineDocu, credits } = again);
      if (!a.ids?.length) break;
    }
  }
  // 5c) KIDEMLİ TASARIMCI KAPISI — önceki hazırlığın kareleri (props) şimdiki görünüm kararlarıyla
  // çizilir; her yazı sahnesi + motif anı kontak sayfasında görme modeline sorulur ("Netflix/LEMMiNO
  // düzeyinde geçer mi?"), kalanlar başka uygulamaya geçer. Tek tur, kare başına kayıtlı, ~0.15 $
  // tavanı; ilk çalıştırmada (props yok) ya da kredisiz atlanır, kayıtlı düzeltmeler her çalıştırmada uygulanır.
  if (settings.docuDesignGate !== false) {
    try {
      const propsFile = path.join(workDir, `${docu.id}.props.json`);
      const prev = readJson(propsFile, null)?.script || null;
      const still = prev ? stillScript(prev, engineDocu) : null;
      const engineDir = docuEngineDir();
      const { placeTimeline } = await import(pathToFileURL(path.join(engineDir, "src", "timeline.js")).href);
      if (still) stagePatch(jobId, "media", 14, "Tasarım kapısı: kilit kareler inceleniyor...");
      const g = await designGate(engineDocu, {
        props: still, placeTimeline, dir, settings, usage, logFn: log2, ffmpeg: settings.ffmpegPath || "ffmpeg", isCancelled,
        render: (items) => renderWithEngine({
          items: items.map((it) => ({ props: { script: still }, out: it.out, composition: "video", frame: it.frame })),
          assets: stillAssets(still, publicDir, engineDir), workDir: path.join(dir, "design-gate"), killer, logFn: () => {},
        }),
      });
      engineDocu = g.script;
      saveUsage();
    } catch (e) {
      if (isCancelled()) return;
      log2(`Tasarım kapısı atlandı: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  // Manual scene corrections (docu-scene-overrides.json: [{match: "<text in say>", set: {...}}]) are applied
  // after every plan, so a fact fix (e.g. a counter's unit) never re-plans or re-pays the directors.
  const overrides = readJson(path.join(dir, "docu-scene-overrides.json"), null);
  if (Array.isArray(overrides) && overrides.length) {
    let hit = 0;
    for (const o of overrides) {
      if (!o?.match || !o.set) continue;
      for (const s of engineDocu.scenes || []) {
        if (!String(s.say || "").includes(o.match)) continue;
        // null removes a field (e.g. {video: null} swaps a wrong clip for a still).
        for (const [k, v] of Object.entries(o.set)) if (v === null) delete s[k]; else s[k] = v;
        hit++;
      }
    }
    log2(`Sahne düzeltmeleri uygulandı: ${hit} sahne`);
  }
  // Açılış hareketi: gerçek klibi olmayan en çok iki açılış sahnesi resimden videoya (Kling 3.0; anahtarı yoksa Replicate).
  if (settings.docuOpeningMotion !== false && (settings.klingKey || settings.replicateKey)) {
    const moving = openingMotionTargets(engineDocu);
    if (moving) log2(`Açılış: ${moving} sahne resimden videoya çevrilecek (gerçek klibi yok)`);
  }
  const engineFile = path.join(workDir, "engine-script.json");
  writeJson(engineFile, engineDocu);

  // 6) MOTOR — görsel, ses, müzik, efekt, render, mastering
  stagePatch(jobId, "media", 15, "Sinematik motor başladı...");
  const writerMade = !!docu.stats?.plannedWords;
  const targetMinutes = docuScriptStats(docu, job).targetMinutes;
  // Anahtar motor kodunu ve ses kütüphanesini de taşır: motor ya da kütüphane
  // değişince aynı senaryo yeniden render edilir (görsel/ses önbellekten, bedava).
  const renderKeyOf = (ed) => [ed, voiceId, docuImageProvider(settings), DOCU_ENGINE_VERSION, docuEngineFingerprint(), lib.version, musicSource];
  let shown = { stage: "", p: -1 };
  /*
   * HAZIRLIK MODU (job.docuPrepareOnly): görsel, klip, seslendirme, müzik ve ses
   * tasarımı yapılır, render yapılmaz. Render CPU'yu, hazırlık ağı ve modelleri
   * kullanır: bir video render olurken sıradakinin hazırlığı yapılır, sonra onun
   * render'ı her şey önbellekte olduğu için doğrudan başlar. Kalite aynıdır.
   */
  if (job.docuPrepareOnly) {
    await runDocuEngine({
      scriptPath: engineFile, workDir, output: path.join(workDir, "prep-output.mp4"),
      srt: path.join(workDir, "prep-subs.srt"), thumbnail: path.join(workDir, "prep-thumb.jpg"),
      voiceId, settings, killer, prepareOnly: true,
      minSeconds: writerMade ? targetMinutes * 60 * 0.95 : 0,
      onLog: log2,
      onProgress: (stage, pct) => updateJob(jobId, { stage: STAGE_OF[stage] || "media", progress: Math.round(15 + (pct / 100) * 70) }),
    });
    if (isCancelled()) return;
    updateJob(jobId, { status: "prepared", stage: "prepared", progress: 85, message: "Hazırlandı — render sırası bekleniyor" });
    return;
  }
  // Otomatik düzeltme açıksa render parçaları ilk geçişten sonra saklanır: yeniden
  // seçilen sahneler yalnızca kendi parçalarını yeniden render ettirir.
  const qaOn = settings.docuQa !== false;
  const autoFix = qaOn && settings.docuAutoFix !== false;
  const renderWith = async (ed, { keepChunks } = {}) => {
    const renderKey = renderKeyOf(ed);
    if (readCheckpoint(dir, "render", renderKey)?.degraded) {
      log2("Önceki render eksik varlıklarla bitmişti; eksikler yeniden deneniyor (kayıtlı görsel ve sesler yeniden ödenmez)");
      invalidateCheckpoints(dir, ["render"]);
    }
    writeJson(engineFile, ed);
    return renderRevision(dir, renderKey, async (renderDir) => {
      const res = await runDocuEngine({
        scriptPath: engineFile,
        workDir,
        output: path.join(renderDir, "output.mp4"),
        srt: path.join(renderDir, "subs.srt"),
        thumbnail: path.join(renderDir, "thumbnail.jpg"),
        voiceId,
        settings,
        killer,
        keepChunks,
        // Seslendirme ölçüldükten sonra müzikten önceki güvenlik ağı: senaryo kapısı
        // tahmine dayanır, bu gerçek ses sürelerine.
        minSeconds: writerMade ? targetMinutes * 60 * 0.95 : 0,
        onLog: log2,
        onProgress: (stage, pct) => {
          const s = STAGE_OF[stage] || "render";
          const p = Math.round(15 + (pct / 100) * 77);
          if (s !== shown.stage) stagePatch(jobId, s, p, `${LABEL[s]}...`);
          else if (p !== shown.p) updateJob(jobId, { progress: p });
          shown = { stage: s, p };
        },
      });
      const warn = engineWarnings(res.warnings);
      return {
        durationSec: res.durationSec, sectionTimes: res.sectionTimes || [], thumbs: [],
        warnings: warn.messages, degraded: !!(res.degraded ?? warn.degraded), musicCues: musicCuesOf(res),
        // Denetim, motorun çizdiği senaryoyu (bölüm kartları ve ses süreleriyle) okur.
        props: typeof res.props === "string" ? res.props : null,
      };
    }, isCancelled);
  };
  let rendered = await renderWith(engineDocu, { keepChunks: autoFix ? true : undefined });
  if (isCancelled()) return;

  // 6b) OTOMATİK KALİTE DENETİMİ (+ en çok bir tur otomatik düzeltme)
  const runQa = async (rend, ed) => {
    const out = path.join(rend.dir, "qa.json");
    const saved = readJson(out, null);
    // Tavan yüzünden görme denetimi atlanmış kayıt, tavan artık izin veriyorsa yeniden denetlenir.
    if (saved?.version === QA_VERSION && !(saved.vision?.skipped === "budget" && !guard.over())) { log2(`Kalite denetimi kayıttan: ${saved.summary}`); return saved; }
    stagePatch(jobId, "finalize", 93, "Otomatik kalite denetimi...");
    try {
      const script = qaScriptOf(readJson(rend.props || "", null)?.script, ed, docu.era);
      const res = await qaVideo({
        video: path.join(rend.dir, "output.mp4"), script, placed: await enginePlacement(script),
        settings, usage, logFn: log2, ffmpeg: settings.ffmpegPath || "ffmpeg", outFile: out, isCancelled, killer, durationSec: rend.durationSec,
        // Görme kararları iş klasöründe: aynı kontak sayfaları (yarıda kalan denetim, değişmeyen parçalar) yeniden ödenmez.
        cacheFile: path.join(dir, "docu-qa-vision.json"),
        skipVision: guard.skip("kalite denetiminin görme modeli (yalnızca ffmpeg ölçümleri yapılıyor)") ? "budget" : null,
      });
      saveUsage();
      return res;
    } catch (e) {
      if (isCancelled()) return null;
      log2(`Kalite denetimi yapılamadı (${String(e?.message || e).slice(0, 200)}); video denetimsiz teslim ediliyor`);
      return null;
    }
  };
  let qa = qaOn ? await runQa(rendered, engineDocu) : null;
  if (isCancelled()) return;
  let fixNote = "";
  if (qa && autoFix && qa.fixable?.length && !readFixes() && !guard.skip("otomatik düzeltme (sorunlu sahnelerin yeniden seçimi ve yeniden render)")) {
    const scenesFix = {};
    for (const f of qa.fixable) {
      const c = credits[`scene-${f.scene}`];
      scenesFix[f.scene] = { rejected: [c?.url].filter(Boolean), kind: f.kind, detail: f.detail };
    }
    writeJson(qaFixFile, { docKey, round: 1, at: new Date().toISOString(), before: qa.summary, scenes: scenesFix });
    const removed = invalidateArchivePicks(dir, directed, Object.keys(scenesFix).map(Number));
    log2(`Otomatik düzeltme: ${qa.fixable.length} sahnenin arşiv seçimi geçersiz sayıldı (${removed} kayıt) — yeniden seçilip yalnızca değişen parçalar render edilecek`);
    try {
      stagePatch(jobId, "media", 93, `Kalite düzeltmesi: ${qa.fixable.length} sahne yeniden seçiliyor...`);
      const prep2 = await prepareEngineDocu();
      if (!prep2 || isCancelled()) return;
      if (JSON.stringify(prep2.engineDocu) === JSON.stringify(engineDocu)) log2("Otomatik düzeltme: yeniden seçim aynı görselleri verdi; yeniden render gerekmedi");
      else {
        const rendered2 = await renderWith(prep2.engineDocu);
        if (isCancelled()) return;
        const qa2 = await runQa(rendered2, prep2.engineDocu);
        if (isCancelled()) return;
        fixNote = `Otomatik düzeltme: ${qa.fixable.length} sahne yeniden seçildi ve video yeniden render edildi (önce: ${qa.issues.length} sorun, sonra: ${qa2 ? qa2.issues.length : "?"}).`;
        ({ engineDocu, credits } = prep2);
        rendered = rendered2;
        qa = qa2;
      }
    } catch (e) {
      if (isCancelled()) return;
      log2(`Otomatik düzeltme tamamlanamadı (${String(e?.message || e).slice(0, 200)}); ilk render teslim ediliyor`);
      writeJson(engineFile, engineDocu);
      if (!rendered.degraded) dropRenderChunks(workDir);
    }
  } else if (autoFix && !rendered.degraded) dropRenderChunks(workDir);
  if (fixNote) log2(fixNote);

  // 7) ÇIKTILAR
  stagePatch(jobId, "finalize", 95, "Çıktılar yazılıyor...");
  const { durationSec, sectionTimes } = rendered;
  for (const w of rendered.warnings || []) quality.push(w);
  if (rendered.degraded) quality.push('Bazı varlıklar eksik kaldı — Kütüphane\'den "Yeniden render / eksikleri tamamla" yalnızca eksikleri yeniden dener.');
  if (fixNote) quality.push(fixNote);
  for (const w of qa?.warnings || []) quality.push(w);
  if (writerMade && durationSec < targetMinutes * 60) quality.push(`Video hedeften kısa: ${Math.floor(durationSec / 60)} dk ${Math.round(durationSec % 60)} sn (hedef ≥ ${targetMinutes} dk).`);
  const muzikler = (rendered.musicCues || []).filter((c) => c?.title).map((c) => ({
    file: c.file || `${c.title}${c.artist ? `--${c.artist}` : ""}.mp3`, title: c.title, artist: c.artist, license: c.license, sourceUrl: c.sourceUrl, licenseUrl: c.licenseUrl,
  }));
  fs.writeFileSync(path.join(rendered.dir, "seo.md"), renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, credits, muzikler.length ? muzikler : null), "utf8");
  publishRevision(dir, rendered);
  writeJson(path.join(dir, "seo.json"), seo);

  // 7b) YOUTUBE PAKETİ — 3 kapak + 5 başlık (docu-package.js): videonun kendi görselleri,
  // görme modeliyle sıralama, Opus planı, motorda çizim, 320x180 okunurluk denetimi.
  // Videodan bağımsız: kredi yoksa belirleyici yedek, çökerse video yine teslim edilir.
  let pkg = null;
  if (settings.docuPackage !== false) {
    stagePatch(jobId, "finalize", 97, "YouTube paketi: kapaklar ve başlıklar...");
    try {
      pkg = await runDocuPackage({ jobDir: dir, job: { ...job, id: jobId }, settings, usage, logFn: log2, isCancelled, killer, ffmpeg: settings.ffmpegPath || "ffmpeg" });
      saveUsage();
    } catch (e) {
      if (isCancelled()) return;
      log2(`YouTube paketi hazırlanamadı (${String(e?.message || e).slice(0, 200)}); video paketsiz teslim ediliyor`);
    }
    if (isCancelled()) return;
  }
  const qualityWarnings = [...new Set(quality)];
  for (const w of qualityWarnings) log2(`Kalite uyarısı: ${w}`);
  updateJob(jobId, {
    status: "done", stage: "done", progress: 100,
    message: seo.incomplete ? "Video üretildi; SEO paketi eksik." : qualityWarnings.length ? "Video üretildi — inceleme önerilir." : "Hazır 🎉",
    usage, needsRerender: false, needsReview: !!seo.incomplete || qualityWarnings.length > 0, qualityWarnings,
    outputs: {
      video: "output.mp4",
      thumbnail: fs.existsSync(path.join(dir, "thumbnail.jpg")) ? "thumbnail.jpg" : null,
      thumbs: pkg?.outputs?.thumbs || [],
      ...(pkg?.outputs?.thumbLabels ? { thumbLabels: pkg.outputs.thumbLabels } : {}),
      ...(pkg && fs.existsSync(path.join(dir, "package.md")) ? { package: "package.md", titles: "titles.json" } : {}),
      seo: "seo.md",
      srt: fs.existsSync(path.join(dir, "subs.srt")) ? "subs.srt" : null,
    },
    meta: { ...(getJob(jobId).meta || {}), durationSec, title: docu.title, degraded: !!rendered.degraded },
  });
  log2(`Video hazır: ${Math.floor(durationSec / 60)} dk ${Math.round(durationSec % 60)} sn, ${docu.scenes.length} sahne`);
}

/** Hazır bir docu senaryosuyla iş başlatmak için (ör. örnek video): senaryoyu işin klasörüne koyar. */
export function seedDocuScript(dir, docu, id) {
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, "docu-script.json"), { ...stripChapterCards(docu), id });
}
