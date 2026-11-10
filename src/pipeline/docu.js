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
import { runDocuScript, novaView, DOCU_GENRES, docuScriptStats, docuElevenNeed, dedupeNameCards, stripChapterCards, LENGTH_GATE, estSceneSeconds } from "./docu-script.js";
import { checkpoint, renderRevision, publishRevision, validScript, readCheckpoint, invalidateCheckpoints } from "./checkpoints.js";
import { renderSeoMarkdown } from "./seo.js";
import { atmosphereFootage, openingMotionTargets, climaxMotionTargets, resolveArchive, duplicatePictures, longHolds, fillHookFootage } from "./docu-archive.js";
import { directEdit, sanitizeDevices, placeAnnotations, ensureMaps } from "./docu-edit-director.js";
import { artDirect, applyArtPlan } from "./docu-art-director.js";
import { topicBible, applyTopicPlan } from "./docu-topic-bible.js";
import { qaVideo, QA_VERSION, invalidateArchivePicks, applyQaRejections, qaAiOnly, PICK_AI_AFTER } from "./docu-qa.js";
import { stablePhotoRefs } from "./media.js";
import { critiqueTimeline } from "./docu-critic.js";
import { runDocuPackage, renderWithEngine } from "./docu-package.js";
import { makeDocuShort } from "./docu-shorts.js";
import { designGate, stillScript, stillAssets, applyGatePatches, sceneFp } from "./docu-design-gate.js";
import { previewGate, applyPreviewAiNotes, aiNote, realNames, PREVIEW_ROUNDS, FULL_ROUNDS } from "./docu-preview.js";
import { auditEra, applyEraRejections, eraRejectedUrls, eraAiOnly, readEraFixes } from "./docu-era-audit.js";
import { hikayeDonemi, sceneEras, backgroundChapters, donemYili } from "./docu-archive.js";
import { kutuKunyesi } from "./kunye.js";
import { claudeSpendUsd } from "../llm.js";
import { markCtaScenes } from "./docu-rhetoric.js";
import { realArticleShots } from "./article-shots.js";
import { attachSourceClips } from "./source-clips.js";
import { holdFootage } from "./footage-hold.js";
import { creditPreflight } from "./credit-preflight.js";
import { faceSafeText, peopleNames } from "./docu-archive.js";

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

/**
 * SENARİST (Ayarlar): Opus 5.5 — hikâye planı da bölümler (anlatımın kendisi) de Opus 5.5;
 * GPT 6.1 — plan da bölümler de gpt-6.1-sol. Kurgu, sanat yönetmeni, konu kimliği her durumda Opus.
 * Kanal sahibi (Ekim 2026): "Nova benden iyi çıkarmalı" — Bakker'ın "şaheser" anlatımını Opus yazmıştı,
 * Nova bölümleri Sonnet'le yazıyordu.
 */
export function docuWriters(settings = {}) {
  if (settings.docuWriterModel === "gpt-6.1-sol") return { bibleModel: "gpt-6.1-sol", chapterModel: "gpt-6.1-sol" };
  return { bibleModel: null, chapterModel: settings.docuChapterModel || "claude-opus-5-5" };
}

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
  if (settings.docuImageProvider !== "manual" && !settings.openaiKey && !settings.replicateKey) missing.push("OpenAI (GPT Image) veya Replicate");
  return missing;
}

/** GPT Image varsa o, yoksa Replicate FLUX; ayar ("docuImageProvider") ikisini de zorlayabilir. */
/**
 * AÇILIŞA DÖNÜŞ (1.16.16, küçük kanal patlamalarının son 2 dakikası kare kare): Hidden History açılıştaki kadetin
 * gerçek fotoğrafıyla, Inside Decoded açılıştaki haritayla, Base Central açılıştaki videoyla, Militopia kaynağın
 * portresiyle bitiyor. Son sahne sakin bir kapanış fotoğrafıysa (photo, işaret/ara plan yok) ve ilk dakikada GERÇEK
 * bir arşiv fotoğrafı varsa son sahne o fotoğrafa döner; künyesi de onunla gelir. Kalite denetimi bunu zaten bilinçli
 * çerçeve sayar (docu-qa.js farRepeats "bookend"). Değişen sahne sayısı (0/1).
 */
export function bookendClosing(script, credits = {}) {
  const scenes = script?.scenes || [];
  const li = scenes.length - 1;
  const last = scenes[li];
  if (li < 3 || last?.type !== "photo" || last.annotate || last.inserts?.length || last.video) return 0;
  let t = 0;
  let fi = -1;
  for (let i = 0; i < li && t < 60; i++) {
    const s = scenes[i];
    if (s?.type === "photo" && s.archived && s.image && !s.video && !s.article) { fi = i; break; }
    t += Number(s?.dur) || 0;
  }
  if (fi < 0 || scenes[fi].image === last.image) return 0;
  // Only when the closing line is about the opening (a shared word with the first minute): the picture must match the words.
  const words = (s) => new Set(String(s || "").toLowerCase().replace(/\[[^\]]*\]/g, " ").match(/\p{L}{4,}/gu) || []);
  let early = new Set();
  t = 0;
  for (let i = 0; i < li && t < 60; i++) { for (const w of words(scenes[i].say)) early.add(w); t += Number(scenes[i]?.dur) || 0; }
  if (![...words(last.say)].some((w) => early.has(w))) return 0;
  const o = scenes[fi];
  scenes[li] = { ...last, image: o.image, archived: true, ...(o.imgW ? { imgW: o.imgW, imgH: o.imgH } : {}), ...(o.focus ? { focus: o.focus } : {}), bookend: fi };
  for (const k of ["search", "imagePrompt", "source"]) delete scenes[li][k];
  if (credits[`scene-${fi}`]) credits[`scene-${li}`] = credits[`scene-${fi}`];
  return 1;
}

/** Kanal adı (köşe damgası): Ayarlar docuChannelNames {epic, news, finance}; stil bu üçünden değilse damga yok. */
export function docuChannelName(settings = {}, job = {}) {
  const key = job.docuFormat === "news" ? "news" : job.docuGenre === "finance" ? "finance" : job.docuGenre === "epic" ? "epic" : null;
  const name = key ? String(settings.docuChannelNames?.[key] || "").replace(/\s+/g, " ").trim() : "";
  return name ? name.slice(0, 32) : null;
}

/** Müziğin ciddiyeti: kanal sahibinin bütün kanalları ciddi; 'open' yalnızca iş/ayar açıkça isterse. */
export const MUSIC_GRAVITIES = ["serious", "grave", "open"];
/**
 * MÜZİĞİN KİMLİĞİ (27 Ekim 2026, müzik denetimi) → motora giden senaryonun üst alanları; müzik seçicisi bunları tahminin
 * önüne koyar. Eskiden hiçbiri yazılmıyordu, seçici dönemi ve ciddiyeti başlıktan/anlatımdan tahmin ediyordu:
 *   musicEra     ana olayın yılı ("1986"); YALNIZCA müzik okur (script.era değil: o alanı görünüm — looks eraStart, tarama
 *                deseni, finansın eski haber çerçevesi — ve kalite denetiminin "hikâyenin dönemi" de okur; Hastings'e 1066
 *                yazmak modern sahneleri dönem hatası gösterirdi, 27 Ekim 2026 incelemesi). Çernobil (20261026-24122a) dönem denetiminde 1986'ydı, seçici "RBMK-1000" ve
 *                "Soviet" sözcüklerinden 1976 çıkardı ve cazlı bir palet kurdu. Sıra: senaryonun kendi era'sı (elle) >
 *                haberde işin açıldığı yıl (Kartal Yuvası 2026 yangını 1942 sayılıp saksafon teması aldı) > dönem denetiminin
 *                yılı (hikayeDonemi) > sahne dönemlerinin süreyle ağırlıklı en yaygını. Geri sayımda yok (her madde kendi yılı).
 *                Sahne dönemi tek başına güvenilmez: Hastings'in (989df5) sahnelerinin %58'i "2026" taşıyor, denetim 1066 der.
 *   format       'news' (haber videosu); geri sayımın 'ranking'i olduğu gibi kalır.
 *   musicChannel 'news' | 'history' | 'finance' | 'docu': müzik geçmişi kanal başına (tarih kanalında Last Sunrise 11 günde
 *                iki kez ana tema oldu; geçmiş penceresi öteki kanalların videolarıyla dolmuştu). script.channel DEĞİL:
 *                o alan köşe damgasının görünen adı (ChannelBug, docuChannelName) — oraya "history" yazmak ekrana basardı.
 *   musicGravity iş > ayar (docuMusicGravity) > 'serious'. Hürmüz, Lula, El Niño 'open' sayılıp hafif parçalar çaldı (~360 sn).
 * @param eraInfo {era: dönem denetiminin dönemi ("1986 (anlatım 1000–2025 arası)"), explicit: senaryonun kendi era'sı,
 *                 scenes, format: senaryonun formatı, genre: senaryonun stili}
 */
export function musicMeta(job = {}, settings = {}, eraInfo = {}) {
  const { era = "", explicit = "", scenes = [], format = null, genre = null } = eraInfo || {};
  const news = job.docuFormat === "news";
  const ranking = job.docuFormat === "ranking" || format === "ranking";
  const asEra = (y) => (Number.isFinite(y) && y !== 0 ? (y < 0 ? `${-y} BC` : String(y)) : "");
  let year = "";
  if (String(explicit || "").trim()) year = String(explicit).trim();
  else if (ranking) year = "";
  else if (news) {
    const t = Date.parse(job.createdAt || "");
    year = String(Number.isFinite(t) ? new Date(t).getFullYear() : new Date().getFullYear());
  } else year = asEra(donemYili(era));
  if (!year && !ranking) {
    const lang = job.language === "tr" ? "tr" : "en";
    const w = new Map();
    for (const s of scenes || []) if (s?.era) w.set(String(s.era), (w.get(String(s.era)) || 0) + estSceneSeconds(s, lang));
    const top = [...w.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) year = asEra(donemYili(top[0])) || top[0];
  }
  const voice = job.elevenVoiceId || job.voiceId || null;
  const sv = settings.docuStyleVoices || {};
  const musicChannel = news ? "news"
    : ranking ? "docu"
    : job.docuGenre === "finance" || (voice && voice === sv.finance) ? "finance"
    : job.docuGenre === "epic" || (voice && voice === sv.epic) ? "history"
    : genre === "finance" ? "finance"
    : genre === "epic" ? "history"
    : "docu";
  const want = String(job.musicGravity || settings.docuMusicGravity || "").toLowerCase();
  return {
    ...(year ? { musicEra: year } : {}),
    ...(news ? { format: "news" } : {}),
    musicChannel,
    musicGravity: MUSIC_GRAVITIES.includes(want) ? want : "serious",
  };
}

export function docuImageProvider(settings) {
  // "manual": AI stills made by hand in ChatGPT (no API credit) — docu-engine/lib/image-inbox.mjs.
  if (settings.docuImageProvider === "manual") return "manual";
  if (settings.docuImageProvider === "replicate" && settings.replicateKey) return "replicate";
  if (settings.docuImageProvider === "openai" && settings.openaiKey) return "openai";
  return settings.openaiKey ? "openai" : "replicate";
}

/**
 * Bugünü anlatan konu: metin bu yılı ya da geçen yılı anıyor ("October 2026"). Satır içindeyken şablon dizgideki `\b`
 * geri silme karakterine (U+0008) dönüyordu; eşleşme hiç olmadı (Kartal Yuvası denetimi, 25 Ekim 2026).
 */
export function mentionsThisYear(text, now = new Date().getFullYear()) {
  return [now, now - 1].some((y) => new RegExp(`\\b${y}\\b`).test(String(text || "")));
}

/** "12 dk 7 sn": önce yuvarlanır — 59,6 sn eskiden "0 dk 60 sn" yazıyordu. */
export function durationLabel(sec) {
  const t = Math.round(Number(sec) || 0);
  return `${Math.floor(t / 60)} dk ${t % 60} sn`;
}

/**
 * Motorun müzik işaretleri → açıklamanın müzik listesi (kunye.js muzikKunyesi). `source` kitaplık parçasını tanıtır:
 * düşünce İngilizce açıklamada her parçanın altına Türkçe "YouTube Ses Kitaplığı — atıf gerekmez" basıldı (Kartal
 * Yuvası, Fransa borcu, 24 Ekim 2026).
 */
export function seoMusicList(cues) {
  return (cues || []).filter((c) => c?.title).map((c) => ({
    file: c.file || `${c.title}${c.artist ? `--${c.artist}` : ""}.mp3`, title: c.title, artist: c.artist, license: c.license, source: c.source, sourceUrl: c.sourceUrl, licenseUrl: c.licenseUrl,
  }));
}

/**
 * Açıklamanın künyesine görsel kutusunun fotoğrafları da girer: Commons dolgusunun docu-archive-done.json'a yazdıkları
 * (kutu bu çalıştırmada dolduysa `credits`te henüz yoktur) ve elle konanların gorsel-kutusu/KUNYE.txt satırları (Kartal
 * Yuvası, 24 Ekim 2026: iki CC BY-SA atfı Nova okumadı, açıklamaya elle eklendi) — fotoğrafı kutuda olan satır. Aynı
 * dosyanın var olan künyesi ezilmez.
 */
export function withInboxCredits(dir, credits = {}) {
  const out = { ...credits };
  const add = (list, as = (k) => k) => {
    const have = new Set(Object.values(out).map((c) => c?.file).filter(Boolean));
    for (const [k, c] of Object.entries(list)) if (c?.file && !have.has(c.file)) out[as(k)] = c;
  };
  add(inboxOnly(readJson(path.join(dir, "docu-archive-done.json"), null)?.credits));
  try {
    const kutu = path.join(dir, "gorsel-kutusu");
    const placed = (k) => ["png", "jpg", "jpeg", "webp"].some((e) => fs.existsSync(path.join(kutu, `${String(Number(k.slice("inbox-".length))).padStart(2, "0")}.${e}`)));
    const elle = kutuKunyesi(fs.readFileSync(path.join(kutu, "KUNYE.txt"), "utf8"), readJson(path.join(kutu, "needed.json"), {}));
    add(Object.fromEntries(Object.entries(elle).filter(([k]) => placed(k))), (k) => `elle-${k}`);
  } catch {}
  return out;
}

/** docu-archive-done.json künyelerinden görsel kutusununkiler (inbox-NN: Commons dolgusu, KUNYE.txt). */
const inboxOnly = (credits) => Object.fromEntries(Object.entries(credits || {}).filter(([k]) => k.startsWith("inbox-")));

/**
 * Yeniden seçim arşiv geçişinin kaydını siler (docu-qa.js invalidateArchivePicks); görsel kutusunun künyeleri o kayıtta
 * durur ve kalır: kutunun fotoğrafı videoda kalıyor. Commons dolgusunun künyesi yalnızca orada — dolgu ön izleme
 * kapısında koşunca kapının sonraki yeniden seçimi onu siliyordu, CC BY atfı açıklamadan, Short'tan ve paketten düşerdi.
 * Yeni geçiş (prepareEngineDocu) bunları kendi kaydına taşır.
 */
export function forgetArchivePicks(dir, docu, sceneIdxs) {
  const file = path.join(dir, "docu-archive-done.json");
  const prev = readJson(file, null);
  const kutu = inboxOnly(prev?.credits);
  const removed = invalidateArchivePicks(dir, docu, sceneIdxs);
  if (Object.keys(kutu).length && !fs.existsSync(file)) writeJson(file, { key: prev.key, credits: kutu });
  return removed;
}

/**
 * Motora giden senaryodaki sahnenin künyesi: görselinin dosyasıyla eşleşen kayıt, yoksa sıranın anahtarı — `i`
 * yönetmenin sırası (directedIndexes; ses klibinde -1). Ses klipleri araya yeni sahne olarak girer (source-clips.js);
 * künye anahtarları (scene-N) eklemeden önceki sırayla kalır, motorun sırası o sahneden sonra bir sonraki sahnenin
 * kaynağını verip yanlış adresi reddettiriyordu.
 */
export function sceneCredit(credits = {}, scene, i) {
  const file = scene?.video || scene?.image;
  return (file && Object.values(credits).find((c) => c?.file === file)) || credits[`scene-${i}`];
}

/**
 * Motora giden senaryonun sırası → yönetmenin senaryosunun (directed) sırası; karşılığı olmayan sahne -1. Ses klipleri
 * (source-clips.js, sourceVoice) araya yeni sahne olarak girer ve sonrakileri kaydırır; kapı ve render sonrası denetim
 * motor sırasıyla konuşur, düzeltme kayıtları (docu-qa-fixes.json, AI notları, arşiv seçimi, scene-N künyeleri) ise
 * yönetmenin sırasıyla okunur. Klipten sonraki sahnenin yeniden seçimi bir sonraki sahnenin arşiv seçimini siliyor, AI
 * notunu ona yazıyordu. Eşleşme anlatımın parmak iziyle (aynı anlatımdan birden çoksa sırasıyla); anlatımı elle
 * değişmiş sahne (docu-scene-overrides.json) eklenen klip kadar kaydırılmış sırayla.
 */
export function directedIndexes(directedScenes = [], engineScenes = []) {
  const at = new Map();
  directedScenes.forEach((s, j) => { const f = sceneFp(s); at.set(f, [...(at.get(f) || []), j]); });
  const used = new Map();
  let inserted = 0;
  return engineScenes.map((s, i) => {
    if (s?.sourceVoice) { inserted++; return -1; }
    const f = sceneFp(s);
    const k = used.get(f) || 0;
    used.set(f, k + 1);
    return at.get(f)?.[k] ?? (i - inserted < directedScenes.length ? i - inserted : -1);
  });
}

/**
 * docu-qa-fixes.json'daki sahne anahtarı: yönetmenin sırası. Araya giren ses klibinin orada sahnesi yok; kaydı yalnızca
 * klibin adresini reddeder (kaynak video adımı onu koymaz) — arşiv seçimi silinmez, AI'a düşen sahne olmaz.
 */
export const fixSceneKey = (at, scene) => (at >= 0 ? at : `klip-${sceneFp(scene)}`);

/**
 * ÖN İZLEME YAMALARI SAHNE BAŞINA BİRİKİR (Kartal Yuvası, 25 Ekim 2026; altı turluk benzetimle doğrulandı): kapı anlatım
 * parmak izi başına TEK yama tutuyordu, her tur da yamaları yönetmenin senaryosuna baştan uygular. İçeriği yanlış cihaz
 * "device-fallback" ile fotoğrafa döndü, fotoğraf kancada 6 sn bekledi; sonraki turun "cutaway"ı yedeğin yerine geçti,
 * cihaz geri geldi, yine bulundu, yine döndü — altı tur (her biri bir hazırlık + ücretli görme turu), render'a yanlış cihaz.
 * Artık bir sahnenin farklı düzeltmeleri yan yana durur ve verildikleri sırayla uygulanır (her yama öncekilerin üstüne
 * planlandı); aynı düzeltmenin yenisi eskisinin yerini alır ve sona geçer. Zincir (tek kayıtta sırayla birkaç adım,
 * "device-fallback+cutaway"; kapı bugün yazmıyor) baştaki adımlarının yenisidir, kayıttaki "device-fallback"in yerine
 * geçer — adımlar iki kez uygulanmaz ("other-style" iki kez stili geri çevirir); applyPreviewPatches onu adımlarına
 * ayırır. Bir yama başka türden yamayı silmez: cihazı fotoğrafa döndüren yedek sonraki turlarda geri alınmaz.
 */
export function mergePreviewPatches(before = [], patches = []) {
  const steps = (p) => String(p.fix || "").split("+");
  const renews = (p, q) => q.say === p.say && steps(q).every((f, k) => steps(p)[k] === f);
  let out = (before || []).filter((p) => p?.say);
  for (const p of patches || []) {
    if (!p?.say) continue;
    out = [...out.filter((q) => !renews(p, q)), p];
  }
  return out;
}

/**
 * Kayıtlı ön izleme yamaları kayıt sırasıyla uygulanır. applyGatePatches parmak izi başına tek yama okur (tasarım
 * kapısının kaydı sahne başına tek): yamalar katmanlara ayrılır — her sahnenin 1. yaması, sonra 2.si... Zincir
 * ("device-fallback+cutaway") adımlarına ayrılır: applyFix tek düzeltme okur, zinciri hiç uygulamazdı — birleştirme onun
 * yerine sildiği "device-fallback" ile cihaz geri gelirdi.
 */
export function applyPreviewPatches(script, patches, { logFn = () => {} } = {}) {
  const list = (patches || []).filter((p) => p?.say).flatMap((p) => String(p.fix || "").split("+").map((fix) => ({ ...p, fix })));
  if (!list.length || !script?.scenes) return script;
  const layers = [];
  const per = new Map();
  for (const p of list) {
    const k = per.get(p.say) || 0;
    per.set(p.say, k + 1);
    (layers[k] ||= []).push(p);
  }
  const n = script.scenes.filter((s) => !(s?.type === "title" && s.chapterCard) && per.has(sceneFp(s))).length;
  if (n) logFn(`Ön izleme: ${n} sahne başka uygulamaya geçti (${[...new Set(list.map((p) => p.fix))].join(", ")})`);
  return layers.reduce((ed, layer) => applyGatePatches(ed, layer), script);
}

/**
 * Süreç ağacını kes (Remotion'ın Chrome'u ve ffmpeg çocukları dahil). taskkill açılamazsa (ENOENT) gelen 'error' olayı
 * dinleyicisiz kalsa ana sürecin uncaughtException'ına düşerdi — tam da bu bekçinin önlediği donma sınıfı.
 */
function killTree(p) {
  if (process.platform === "win32" && p.pid) {
    try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }).on?.("error", () => {}); } catch {}
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
 * @param onActivity  motorun her çıktı parçasında (stdout/stderr) çağrılır — ön izleme turunun bekçisi (gateWatchdog)
 * @param exitGraceMs 'exit'ten bu kadar sonra 'close' gelmediyse borular kapatılır ve sonuç verilir
 *
 * SÖZ BİR KEZ BAĞLANIR, DİNLEYİCİDEN HATA FIRLAMAZ (Denizaltı 20261024-373aaf, 25 Ekim 2026: iş 48 dk dondu). onProgress
 * → updateJob → job.json'un rename'i EPERM verdi; hata stdout dinleyicisinden ana sürecin uncaughtException'ına düştü.
 * Günlük/ilerleme geri çağrıları artık yutulur, olay akışı sürer. Söz yalnızca 'close'u beklerdi: borunun ucunu miras
 * alan bir torun (Remotion'ın Chrome'u, ffmpeg) yaşarsa 'close' hiç gelmez. Takılmada bütün ağaç kesilir (taskkill /T /F)
 * ve söz 'close' beklenmeden reddedilir (docu-package.js renderWithEngine ile aynı kurallar).
 */
export function runDocuEngine({ scriptPath, workDir, output, srt, thumbnail, voiceId, settings, killer, onLog, onProgress, onActivity, minSeconds = 0, stallMs = STALL_MS, exitGraceMs = 15000, prepareOnly = false, keepChunks, patchScenes = null }) {
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
    // Okuma hızı (1.16.16): yeni sesler ElevenLabs hızıyla; önbellekteki sesler aynen (docu-engine/lib/produce.mjs speak).
    voiceSpeed: Number.isFinite(Number(settings.docuVoiceSpeed)) ? Number(settings.docuVoiceSpeed) : undefined,
    imageProvider: docuImageProvider(settings),
    // Yama render (patchJob): yalnızca bu sahnelerin parçaları yeniden çizilir.
    ...(Array.isArray(patchScenes) && patchScenes.length ? { patchScenes } : {}),
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
    // Günlük yazılamasa da (job.json EPERM) olay akışı sürer: buradan fırlayan hata ana sürece düşerdi.
    const safe = (fn, ...a) => { try { fn?.(...a); } catch {} };
    let settled = false;
    let exited = false;
    let timer = null;
    let grace = null;
    const settle = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      fn(v);
    };
    const finish = (code) => {
      if (settled) return;
      if (killer?.cancelled) return settle(reject, new Error("cancelled"));
      if (code === 0 && done) return settle(resolve, done);
      // Kısa mesaj kullanıcıya, yığın ve stderr günlüğe: hata ayıklamak için ikisi de gerekir.
      if (failure?.stack) safe(onLog, `Motor hata ayrıntısı: ${String(failure.stack).slice(0, 1500)}`);
      if (errTail.trim()) safe(onLog, `Motor stderr: ${errTail.trim().slice(-1200)}`);
      const msg = failure?.msg || errTail.trim().split("\n").slice(-3).join(" ") || `motor ${code} koduyla çıktı`;
      settle(reject, new Error(`Sinematik motor: ${msg}`.slice(0, 600)));
    };
    // Takılma bekçisi: kuyruk tek iş çalıştırıyor, donmuş bir Remotion/Chrome
    // arkadaki bütün videoları süresiz bekletirdi. Yalnızca çocuk yaşarken kurulur: bittikten
    // sonra gelen veri, PID'si başka sürece geçmiş olabilecek bir ağacı kesmesin.
    const arm = () => {
      safe(onActivity);
      clearTimeout(timer);
      if (settled || exited) return;
      timer = setTimeout(() => {
        killTree(p);
        try { p.stdout.destroy(); } catch {}
        try { p.stderr.destroy(); } catch {}
        settle(reject, killer?.cancelled ? new Error("cancelled")
          : new Error(`Sinematik motor ${Math.round(stallMs / 60000)} dakika yanıt vermedi ve durduruldu. Üretilen görsel ve sesler korunur — "Kaldığı yerden devam et" ile sürdürün.`));
      }, stallMs);
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
        try { ev = JSON.parse(line); } catch { safe(onLog, line); continue; }
        if (ev?.type === "log") safe(onLog, ev.msg);
        else if (ev?.type === "progress") safe(onProgress, ev.stage, ev.pct);
        else if (ev?.type === "done") done = ev;
        else if (ev?.type === "error") failure = ev;
      }
    });
    p.stderr.on("data", (d) => { arm(); errTail = (errTail + d).slice(-2000); });
    p.on("error", (e) => settle(reject, e));
    p.on("exit", (code) => {
      exited = true;
      clearTimeout(timer);
      // 'close' boruların da kapanmasını bekler; torun Chrome/ffmpeg stdout/stderr'i miras alıp açık tutarsa hiç gelmez.
      grace = setTimeout(() => {
        try { p.stdout.destroy(); } catch {}
        try { p.stderr.destroy(); } catch {}
        finish(code);
      }, exitGraceMs);
      grace.unref?.();
    });
    p.on("close", (code) => finish(code));
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
/**
 * A failed auto-fix round leaves the job as it was before the round: the finished archive pass, the pick cache and
 * the fix record are written back (null = the file did not exist, so it is removed). Returns what came back.
 */
export function restoreAfterFailedFix(dir, keep = {}) {
  const back = [];
  for (const [f, v] of Object.entries(keep)) {
    const p = path.join(dir, f);
    try {
      if (v == null) { if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); back.push(`${f} (kaldırıldı)`); } }
      else { writeJson(p, v); back.push(f); }
    } catch {}
  }
  return back.join(", ");
}

function dropRenderChunks(workDir) {
  const dirc = path.join(workDir, "chunks");
  try {
    for (const f of fs.readdirSync(dirc)) if (/^[va]-[\w-]+\.(mp4|wav)$/.test(f)) fs.rmSync(path.join(dirc, f), { force: true });
  } catch {}
}

/** Motor aşamaları → Nova'nın aşama şeridi ve yüzdesi (15-92 arası). */
const STAGE_OF = { images: "media", voice: "voice", music: "music", sfx: "music", ambience: "music", render: "render", master: "render" };
const LABEL = { media: "Görseller üretiliyor", voice: "Seslendirme", music: "Müzik ve ses tasarımı", render: "Render" };

/**
 * Motorun ilerleme olayı → iş kaydı, yalnızca görünen değer değişince (Denizaltı 20261024-373aaf, 25 Ekim 2026): motor her
 * %0,1'de bir satır yazar; ön izleme hazırlığı ve hazırlık modu her satırda job.json'u yeniden yazıyordu (fsync + rename).
 * Dışarıdan bir okuyucu dosyayı tutunca o yazımlardan biri EPERM verdi ve iş dondu. Aşama ya da yuvarlanmış yüzde
 * değişmedikçe yazılmaz. Motorun %0-100'ü işin [from, from + span] aralığına düşer.
 */
export function engineProgress(write, { from = 15, span = 77, stage: fallback = "media" } = {}) {
  let last = null;
  return (stage, pct) => {
    const next = { stage: STAGE_OF[stage] || fallback, progress: Math.round(from + (pct / 100) * span) };
    if (last?.stage === next.stage && last.progress === next.progress) return;
    last = next;
    write(next);
  };
}

/** Ön izleme turunun en uzun sessizliği (Ayarlar: docuGateStallMs). */
export const GATE_STALL_MS = 10 * 60 * 1000;

/**
 * ÖN İZLEME TURUNUN BEKÇİSİ (Denizaltı 20261024-373aaf, 25 Ekim 2026: kapının 2. turu 17:13'te sustu, iş 48 dk hiçbir şey
 * yapmadan bekledi — ne yeniden deneme ne durma). Motorun bekçisi (25 dk) yalnızca motoru görür; kare çizici, görme
 * modeli, yeniden seçim ve aralarındaki her söz turu süresiz bekletebilir. Turun adımları `race` ile bekçiye bağlanır;
 * `touch` (günlük satırı, motor ilerlemesi, çocuk sürecin çıktısı) `stallMs` boyunca gelmezse turun süreç ağaçları kesilir
 * ve tur "Ön izleme N dk ilerlemedi" diye reddedilir: kapının catch'i bunu teknik hata sayar (tur başına bir yeniden deneme).
 * `killer`: turun süreçleri hem işin killer'ına (iptal onları da keser) hem bekçinin listesine girer; bekçi yalnızca
 * turunkileri keser, iş iptal edilmiş sayılmaz. Takılan turda `killer.cancelled` doğrudur: geride kalan adım yeni süreç açmaz.
 * `race(step, { own: true })`: adımın kendi bekçisi var (motor: 25 dk + 'exit' payı, her durumda bağlanır); o sürerken
 * sessizlik sayılmaz — hazırlıkta Kling klibi 12 dk'ya kadar tek satır yazmadan beklenir, kapı onu takıldı sanmasın.
 */
export function gateWatchdog({ stallMs = GATE_STALL_MS, killer = null } = {}) {
  let last = Date.now();
  let held = 0;
  let fail = null;
  const dead = new Promise((_, rej) => { fail = rej; });
  dead.catch(() => {});
  const procs = new Set();
  const wait = stallMs >= 60000 ? `${Math.round(stallMs / 60000)} dk` : `${Math.round(stallMs / 1000)} sn`;
  const w = {
    stalled: false,
    touch: () => { last = Date.now(); },
    killer: {
      get cancelled() { return !!killer?.cancelled || w.stalled; },
      add(p) { killer?.add?.(p); procs.add(p); p.on?.("close", () => procs.delete(p)); },
      signal: () => killer?.signal?.(),
    },
    race: (step, { own = false } = {}) => {
      if (!own) return Promise.race([step, dead]);
      held++;
      return Promise.race([Promise.resolve(step).finally(() => { held--; last = Date.now(); }), dead]);
    },
    stop: () => clearInterval(tick),
  };
  const tick = setInterval(() => {
    if (held || Date.now() - last < stallMs) return;
    w.stalled = true;
    clearInterval(tick);
    for (const p of procs) killTree(p);
    fail(new Error(`Ön izleme ${wait} ilerlemedi — turun süreçleri durduruldu`));
  }, Math.max(10, Math.min(30000, Math.round(stallMs / 10))));
  tick.unref?.();
  return w;
}

const OPEN_SEV = new Set(["medium", "high"]);
/** Her turda bütün videodan yeniden çıkan bulgular (docu-preview.js: zaman çizelgesi eleştirmeni) — eskisi taşınmaz. */
const WHOLE_VIDEO = new Set(["hook_slow", "long_hold"]);

/**
 * KAPI "TEMİZ" DEMEZ, DÜZELTEMEDİĞİ BULGU KALDIYSA (Denizaltı 20261024-373aaf, 25 Ekim 2026; 2. tur inceleme R4): bozuk
 * karenin basamakları bitince ya da düzeltmesi olmayan bir bulguda (yalnızca raporlanan türler) plan boş kalır; `changed`
 * boş diye kayıt clean:true, günlük "Ön izleme temiz — düzeltilecek sorun kalmadı", render öncesi "kapı temiz" diyordu,
 * son raporda orta/yüksek bulgu dururken. Açık bulgu: orta ve üstü, sahnesi bu turda değişmeyen. Doğrulama turu
 * (report.only) yalnızca değişen sahnelere bakar: önceki turların açık bulguları bakılmayan sahnelerde kalır.
 * @returns [{scene, kind, severity, detail}] — sahne motorun sırası (null: sahnesiz kare, ör. bölüm kartı)
 */
export function openGateFindings(prev = [], report = {}, changed = []) {
  const looked = Array.isArray(report?.only) ? new Set(report.only) : null;
  const moved = new Set(changed || []);
  const out = new Map();
  const add = (x) => out.set(`${x.scene}|${x.kind}|${x.detail}`, { scene: x.scene ?? null, kind: x.kind, severity: x.severity, detail: x.detail });
  for (const x of prev || []) if (x && looked && !looked.has(x.scene) && !moved.has(x.scene) && !WHOLE_VIDEO.has(x.kind)) add(x);
  for (const x of report?.issues || []) if (x && OPEN_SEV.has(x.severity) && !moved.has(x.scene)) add(x);
  return [...out.values()];
}

/** "sahne 5: broken — …; sahne 9: mismatch — …" (günlük ve kalite uyarısı). */
const findingList = (xs) => `${xs.slice(0, 6).map((x) => `sahne ${Number.isInteger(x.scene) ? x.scene + 1 : "-"}: ${x.kind} — ${String(x.detail || "").slice(0, 100)}`).join("; ")}${xs.length > 6 ? "…" : ""}`;

export async function runDocuJob({ jobId, job, dir, usage, saveUsage, isCancelled, killer, stagePatch, cachedSeo }) {
  // Ön izleme turunun bekçisi (gateWatchdog) her günlük satırını ilerleme sayar; tur dışında boş.
  let gateTouch = () => {};
  const log2 = (m) => { gateTouch(); log(jobId, m); };
  const settings = getJobSettings(job);
  // Görsel kaynağı işin ayar kopyasında donmaz (config.js SNAPSHOT_KEYS): eski kopyası başka kaynak diyen iş bunu bir kez söyler.
  // Yeni işin kopyasında kaynak yok: başladığı kaynak ilk çalıştırmada işe yazılır (render anahtarı onu taşır).
  const startedWith = job.settingsSnapshot?.docuImageProvider || job.docuImageProviderAtStart;
  if (!startedWith && settings.docuImageProvider) updateJob(jobId, { docuImageProviderAtStart: settings.docuImageProvider });
  if (startedWith && startedWith !== settings.docuImageProvider) log2(`Görsel kaynağı ayarlardan: ${docuImageProvider(settings)} (iş ${startedWith} ile başlamıştı)`);
  const guard = claudeGuard(usage, settings, log2);
  if (guard.spent() >= 0.01) log2(`Claude harcaması bu video için şimdiye kadar ~$${guard.spent().toFixed(2)}${guard.max > 0 ? ` (tavan $${guard.max.toFixed(2)})` : ""}`);
  const hasScript = !!readJson(path.join(dir, "docu-script.json"))?.scenes?.length || !!job.docuSeed?.scenes?.length;
  const missing = docuMissingKeys(settings, { seeded: hasScript });
  if (missing.length) throw new Error(`Sinematik Belgesel için anahtar eksik: ${missing.join(", ")}. Ayarlar'dan ekleyin.`);
  // Kredi ön kontrolü (credit-preflight.js): yeni iş, ödediği servislerin kredisi yetmiyorsa hiç başlamaz. Devam eden
  // iş yalnızca uyarılır (sesi ve görselleri zaten yapılmış olabilir; eksik görselde motor kutuda durur).
  {
    const pre = await creditPreflight(settings, { provider: docuImageProvider(settings) });
    for (const w of pre.warnings) log2(w);
    if (pre.problems.length && !hasScript) throw new Error(`İş başlamadı — ${pre.problems.join("; ")}`);
    for (const p of pre.problems) log2(`UYARI: ${p}`);
  }
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
    // voiceSpeed: süre tavanı ölçülen film temposunu kullanıcının okuma hızıyla ölçekler (yoksa ölçülen 1.1 varsayılır).
    docu = await runDocuScript(job, research, usage, log2, { dir, isCancelled, eleven: { musicSource, libraryReady: lib.ready }, voiceSpeed: settings.docuVoiceSpeed, styleVoices: settings.docuStyleVoices, ...docuWriters(settings) });
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
  const today = job.docuFormat === "news" || mentionsThisYear(`${job.topic || ""} ${job.guidance || ""}`, thisYear);
  // Haber planının arka plan bölümleri (docu-bible.json): yılsız satır tarihî yılı yalnızca orada alır (docu-archive.js sceneEras).
  const planBible = readJson(path.join(dir, "docu-bible.json"), null)?.value;
  const withEras = sceneEras(docu, { news: today, now: thisYear, background: backgroundChapters(planBible, docu) });
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
  // Harita güvencesi (1.16.16, "Haritalı anlatım" sekmesi): yönetmen/yazar harita koymadıysa ülke adı geçen sahneler
  // dünya haritasına döner. Diğer videolarda haritayı yalnızca yazar/yönetmen koyar.
  try {
    if (job.docuMapMode === "haritali") directed = ensureMaps(directed, { logFn: log2 }).script;
  } catch (e) {
    log2(`Harita güvencesi atlandı: ${String(e?.message || e).slice(0, 160)}`);
  }

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
  // Ön izleme kapısının (docu-preview.js) kararları: AI görsel notları ve yazı düzeltmeleri, aynı senaryoya aitse.
  const pvFile = path.join(dir, "docu-preview-fixes.json");
  const readPv = () => { const f = readJson(pvFile, null); return f?.docKey === docKey ? f : null; };
  // Görsel kutusunun künyeleri (inbox-NN) geçişin kaydında durur; kayıt silinse de (kapının yeniden seçimi:
  // forgetArchivePicks, dönem denetimi) aynı senaryonun yeni geçişine taşınır.
  const inboxKept = {};
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
      if (!prev?.key || prev.key === docKey) Object.assign(inboxKept, inboxOnly(prev?.credits));
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
          aiOnly: [...eraAiOnly(readEra(), era), ...qaAiOnly(readFixes())],
          // 170 sahnelik bir belgeselde arşiv adımı dakikalar sürer; ilerleme görünmeli (log'a değil, yalnızca iş mesajına).
          onProgress: (d, n) => { gateTouch(); updateJob(jobId, { message: `Arşivde gerçek fotoğraflar aranıyor... ${d}/${n}` }); },
        }));
        saveUsage();
        if (isCancelled()) return null;
        writeJson(doneFile, { key: docKey, script: ed, credits: { ...inboxKept, ...credits } });
      }
    }
    ed = stripChapterCards(structuredClone(ed));
    credits = { ...credits };
    const rejectedToAi = applyQaRejections(ed, credits, readFixes(), log2);
    if (rejectedToAi) log2(`${rejectedToAi} sahne kalite denetiminin reddettiği kaynağı yeniden aldığı için AI görseline çevrildi`);
    const eraFix = applyEraRejections(ed, credits, readEra(), log2);
    if (eraFix.toAi) log2(`${eraFix.toAi} sahne/kare dönem denetiminin reddettiği kaynağı yeniden aldığı için AI görseline çevrildi`);
    const pvAi = applyPreviewAiNotes(ed.scenes, readPv()?.ai);
    if (pvAi) log2(`Ön izleme: ${pvAi} AI görseli anlatımla güçlendirilmiş istemle yeniden üretilecek`);
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
    // KAYNAK VİDEO (source-clips.js, 1.16.19): olayın gerçek görüntüsü ve kişinin kendi sesi. EN SONDA — ses klipleri
    // yeni sahne olarak araya girdiği için sahne sırasına bağlı bütün kararlar (sanat, konu, düzeltmeler) önce uygulanır.
    if ((job.docuSource || "archive") === "archive" && settings.docuSourceClips !== false) {
      try {
        // Ön izleme / render sonrası denetim / dönem denetiminin reddettiği klipler kayıttan yeniden konmaz (Kartal Yuvası,
        // 25 Ekim 2026: reddedilen drone klibi her turda 1. sahneye döndü, kanca evi hiç göstermedi). Adresle eşleşir, sırayla değil.
        const rejected = [...Object.values(readFixes()?.scenes || {}).flatMap((x) => x.rejected || []), ...eraRejectedUrls(readEraFixes(dir), era)];
        const src = await attachSourceClips(ed, { dir, publicDir, buildPrefix: `build/${docu.id}`, credits, settings, usage, logFn: log2, ffmpeg: settings.ffmpegPath || "ffmpeg", isCancelled, rejected, news: job.docuFormat === "news" });
        ed = src.script;
        credits = src.credits;
        saveUsage();
      } catch (e) {
        // Kredi/ağ durmasından önce ödenen plan, sosyal arama ve görme çağrıları hemen kaydedilir (2. tur R3).
        saveUsage();
        if (isCancelled()) return null;
        log2(`Kaynak video atlandı: ${String(e?.message || e).slice(0, 160)}`);
      }
    }
    // GERÇEK GÖRÜNTÜ AKSIN (footage-hold.js, 28 Ekim 2026): klip ardındaki uygun satırlarda sürer (en çok 30 sn), gerçek
    // görüntüye giriş/çıkıştaki whip/flash/match geçişleri kesmeye döner. Ses klipleri araya girdikten SONRA: sıra kesin.
    if (settings.docuFootageHold !== false) {
      try { ed = holdFootage(ed, { logFn: log2 }).script; } catch (e) { log2(`Gerçek görüntü tutma uygulanamadı: ${String(e?.message || e).slice(0, 160)}`); }
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
  // Ön izleme kapısı bu senaryoya baktıysa (docu-preview-fixes.json, aynı docKey) bu kapı çalışmaz: her sahneyi o zaten
  // gördü. İlk geçişte props olmadığı için atlanan kapı, yama/yeniden render'da ilk kez çalışıp onaylanmış videonun 14
  // sahnesini değiştiriyordu; iki sahnelik yama 8 parçanın hepsini yeniden çizdi (18 Ekim 2026, Hürmüz, ~50 dk).
  if (settings.docuDesignGate !== false && !readPv()) {
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
  /*
   * SON HAZIRLIK — motora giden senaryonun son adımları: elle sahne düzeltmeleri, izleyici düğmesi, kanca görüntüsü,
   * açılış/doruk hareketi, gerçek makale görüntüsü, kapanışın açılışa dönüşü, kanal damgası. İlk geçişte, ön izlemenin
   * düzeltme turlarında ve render sonrası otomatik düzeltmede AYNI adımlar (17 Ekim 2026, Ebola: otomatik düzeltme
   * yeniden seçimden sonra bunları atlıyordu; açılış hareketi, makale görüntüsü, düğme ve damga kayboluyor, değişen
   * sahne sayısı artıp daha çok parça yeniden render ediliyordu).
   * fresh: senaryo prepareEngineDocu'dan yeni geldi → tasarım kapısının kayıtlı düzeltmeleri de uygulanır.
   * report: tekrar eden görsel / uzun bekleyen kare uyarıları (yalnızca ilk geçişte, iki kez yazılmasın).
   */
  const patching = Array.isArray(job.patchScenes) && job.patchScenes.length;
  const finishEngineDocu = async (ed, cr, { fresh = false, report = false } = {}) => {
    const say = report ? log2 : () => {};
    if (fresh) {
      const gate = readJson(path.join(dir, "docu-design-gate.json"), null);
      if (gate?.patches?.length) ed = applyGatePatches(ed, gate.patches);
    }
    const pv = readPv();
    // Bir sahnenin bütün yamaları, verildikleri sırayla (cihaz yedeği + ara plan, yazı): mergePreviewPatches.
    if (pv?.patches?.length) ed = applyPreviewPatches(ed, pv.patches, { logFn: say });
    // Manual scene corrections (docu-scene-overrides.json: [{match: "<text in say>", set: {...}}]) are applied
    // after every plan, so a fact fix (e.g. a counter's unit) never re-plans or re-pays the directors.
    const overrides = readJson(path.join(dir, "docu-scene-overrides.json"), null);
    if (Array.isArray(overrides) && overrides.length) {
      let hit = 0;
      for (const o of overrides) {
        if (!o?.match || !o.set) continue;
        for (const s of ed.scenes || []) {
          if (!String(s.say || "").includes(o.match)) continue;
          // null removes a field (e.g. {video: null} swaps a wrong clip for a still).
          for (const [k, v] of Object.entries(o.set)) if (v === null) delete s[k]; else s[k] = v;
          hit++;
        }
      }
      say(`Sahne düzeltmeleri uygulandı: ${hit} sahne`);
    }
    if (report) {
      // Aynı görsel uzak sahnelerde tekrar ediyorsa render'dan ÖNCE söylenir (izleyici "aynı resim yine" der).
      const dupPics = duplicatePictures(ed.scenes);
      if (dupPics.length) {
        const m = `Aynı görsel birden çok sahnede: ${dupPics.slice(0, 6).map((d) => `${path.basename(d.file)} (sahne ${d.scenes.map((i) => i + 1).join(", ")})`).join("; ")}`;
        log2(m);
        quality.push(m);
      }
      // Aynı resim art arda uzun süre ekranda (önceki-kare zinciri): render'dan önce söylenir.
      const holds = longHolds(ed.scenes);
      if (holds.length) {
        const m = `Aynı resim art arda uzun süre ekranda: ${holds.slice(0, 6).map((h) => `${path.basename(h.file)} (sahne ${h.scenes[0] + 1}-${h.scenes.at(-1) + 1}, ~${Math.round(h.sec)} sn)`).join("; ")}`;
        log2(m);
        quality.push(m);
      }
    }
    // Videonun tek izleyici çağrısı ekranda: beğeni/abone ya da yorum düğmesi söylendiği kelimede (motor src/cta.tsx).
    const ctaN = markCtaScenes(ed.scenes);
    if (ctaN) say(`İzleyici çağrısı: ${ctaN} sahnede animasyonlu düğme (kelimesinde, ~2,4 sn)`);
    // Kancadaki düşük çözünürlüklü gerçek görüntü küçük kutu yerine tam ekran (fillHookFootage).
    try {
      await fillHookFootage(ed.scenes, { publicDir, ffmpeg: settings.ffmpegPath || "ffmpeg", logFn: say });
    } catch (e) {
      say(`Kanca görüntüsü büyütülemedi: ${String(e?.message || e).slice(0, 160)}`);
    }
    // Açılış hareketi: gerçek klibi olmayan en çok iki açılış sahnesi resimden videoya (Kling 3.0; anahtarı yoksa Replicate).
    if (settings.docuOpeningMotion !== false && (settings.klingKey || settings.replicateKey)) {
      const moving = openingMotionTargets(ed);
      if (moving) say(`Açılış: ${moving} sahne resimden videoya çevrilecek (gerçek klibi yok)`);
      // Doruk anları da hareket edebilir (ucuz model, varsayılan en çok 2; Ayarlar: docuClimaxMotionMax, 0 = kapalı).
      const doruk = climaxMotionTargets(ed, { max: Number.isFinite(+settings.docuClimaxMotionMax) ? +settings.docuClimaxMotionMax : 2, intensity: ed.intensity || [] });
      if (doruk) say(`Doruk: ${doruk} gergin sahne resimden videoya (Kling 2.5 Turbo 720p)`);
    }
    // Gerçek haber görüntüsü (1.16.16): araştırmadaki makaleyle eşleşen manşet, sayfanın kendisi olur (başlığı sarıyla
    // çizilmiş ekran görüntüsü, altında kaynak ve tarih). Yalnızca masaüstü uygulamada (Electron); olmazsa çizilmiş manşet kalır.
    // Yama render eski bir videoyu değiştirmez: ekran görüntüsü yalnızca daha önce alınmışsa (önbellekten) kullanılır.
    if (settings.docuArticleShots !== false && ed.scenes.some((sc) => sc.type === "headline") && (!patching || fs.existsSync(path.join(dir, "article-shots.json")))) {
      try {
        const rf = path.join(dir, "research.md");
        const n = await realArticleShots(ed, { research: fs.existsSync(rf) ? fs.readFileSync(rf, "utf8") : "", publicDir, jobId, dir, credits: cr, logFn: say });
        if (n) say(`Gerçek haber görüntüsü: ${n} manşet sahnesi makalenin kendisi oldu`);
      } catch (e) {
        say(`Haber görüntüsü atlandı: ${String(e?.message || e).slice(0, 160)}`);
      }
    }
    // Açılışa dönüş (1.16.16): son sakin kapanış fotoğrafı ilk dakikadaki gerçek fotoğrafa döner; yama eski videoya dokunmaz.
    if (!patching && bookendClosing(ed, cr)) say("Kapanış: son sahne açılıştaki gerçek fotoğrafa dönüyor");
    // Yazı yüzün üstüne binmez, ad başkasının resmine yazılmaz (Lula / Çernobil, 26 Ekim 2026; docu-archive.js faceSafeText):
    // yüzlü resimdeki büyük yazı alt üçte bire iner; isim kartı/anahtar kelime/vuruştaki ad yalnızca o kişinin gerçek resminde.
    // Resmi değiştiren adımlardan SONRA (inceleme, 27 Ekim 2026): kapanışın açılış fotoğrafına dönüşü (bookendClosing) son
    // satırın altına yeni bir resim koyar — kural ondan önce çalışınca o resim hiç denetlenmiyordu.
    // Yama render: kuraldan ÖNCE render edilmiş eski videonun (iş bayraksız) başka sahnelerine dokunmaz (parçaları yeniden
    // çizilirdi). Kuralla render edilmiş videoda (job.docuFaceSafe, ilk normal hazırlıkta yazılır; docuChannel gibi) aynen
    // yeniden uygulanır: atlansaydı korunacak parçaların içeriği değişir, o parçalar yeniden çizilir ve yazı yüze, ad
    // başkasının resmine geri dönerdi (inceleme, 27 Ekim 2026: kural Macaristan 1956'da 10, Suudi–Husi haberinde 8 sahneye
    // textAt verirdi — videoya yayılmış, neredeyse bütün parçalar).
    if (!patching || job.docuFaceSafe) {
      faceSafeText(ed.scenes, { credits: cr, people: peopleNames(directed), names: (job.docuSource || "archive") === "archive", logFn: say });
      if (!patching && !job.docuFaceSafe) { updateJob(jobId, { docuFaceSafe: true }); job.docuFaceSafe = true; }
    }
    // Kanal damgası (1.16.16, tutmuşlarda her kanalın köşe logosu): Ayarlar'daki kanal adı (tarih/gündem/finans). İşe ilk
    // render'da yazılır; yama render ya da sonraki render aynı damgayı kullanır, damgasız eski bir videoya yama eklemez.
    const channel = job.docuChannel ?? (patching ? null : docuChannelName(settings, job));
    if (channel) {
      ed.channel = channel;
      if (!job.docuChannel) { updateJob(jobId, { docuChannel: channel }); job.docuChannel = channel; }
    }
    // Müziğin kimliği (musicMeta, 27 Ekim 2026): ana olayın yılı, haber biçimi, müzik geçmişinin kanalı, ciddiyet. YALNIZCA
    // motora giden senaryoya: docu/directed'e yazılsa yönetmenlerin kayıt anahtarı (script.era) değişip ücretli planlar
    // yeniden istenirdi, sceneEras de (script.era varken) sahne dönemlerini hiç kurmazdı. Elle verilmiş alan ezilmez.
    // Dönem musicEra'ya yazılır, script.era'ya değil: görünüm ve kalite denetimi değişmez; yama render da aynı yılı
    // hesaplar (yalnız müzik okur), ilk render ile yamanın müziği ayrışmaz.
    const mm = musicMeta(job, settings, { era: hikayeDonemi(ed), explicit: ed.era, scenes: ed.scenes, format: ed.format, genre: ed.genre });
    for (const [k, v] of Object.entries(mm)) if (ed[k] == null || ed[k] === "") ed[k] = v;
    say(`Müzik kimliği: dönem ${ed.musicEra || "-"} · kanal ${ed.musicChannel} · ciddiyet ${ed.musicGravity}${ed.format ? ` · ${ed.format}` : ""}`);
    return ed;
  };
  engineDocu = await finishEngineDocu(engineDocu, credits, { report: true });
  const engineFile = path.join(workDir, "engine-script.json");
  writeJson(engineFile, engineDocu);
  const writerMade = !!docu.stats?.plannedWords;
  const targetMinutes = docuScriptStats(docu, job).targetMinutes;

  /*
   * 5d) ÖN İZLEME KAPISI (docu-preview.js) — render'dan ÖNCE: motor hazırlık modunda görselleri, sesi ve zamanlamayı
   * hazırlar (render yok; hepsi render için önbellekte kalır), her sahnenin oturmuş anından bir kare çizilir ve render
   * sonrası denetimin aynı görme denetimiyle bakılır. Uymayan arşiv yeniden seçilir, uymayan AI görseli anlatımla
   * güçlendirilmiş istemle yeniden üretilir, taşan yazı sadeleşir, bekleyen kareye ara plan kesilir. 1. tur bütün sahneler; sonraki turlar yalnızca düzeltilen
   * sahnelerin doğrulaması (en çok PREVIEW_ROUNDS; tur sayısı senaryo başına kalıcı).
   * 17 Ekim 2026, Ebola: bu sorunlar 75 dk'lık render'dan sonra bulunup bir saatlik ikinci render'la düzeltiliyordu.
   */
  // Görsel kutusu → Commons, durma başına bir kez (kapıda ya da render'da): aynı durma için ikinci Commons + görme turu ödenmez.
  let commonsTried = false;
  if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly) {
    // Kapının teknik hatası (çizicinin tarayıcısı açılmadı, ağ koptu) bir kez yeniden denenir; ChatGPT kutusu beklemesi
    // teknik hata değildir (görsel gelmeden render da olmaz). Fransa borcu, 24 Ekim 2026: "Timed out … connect to the
    // browser" kapıyı tek seferde kapattı, video denetimsiz render'a girdi ve sondaki denetim düzeltme turu açabildi.
    let gateRetries = 1;
    // Hak TUR başına (Denizaltı, 25 Ekim 2026): 1. turun kapak tarayıcısı zaman aşımı işin tek hakkını harcamıştı, 2. turun
    // takılması yeniden denenemezdi. Aynı turun yeniden koşusu (Commons dolgusu, yeniden deneme) hakkı yenilemez.
    let retryRound = 0;
    // Bu kadar süre hiç ilerlemeyen tur (günlük satırı, motor çıktısı, çizilen kare yok) kesilir: teknik hata sayılır.
    const gateStallMs = Number(settings.docuGateStallMs) > 0 ? Number(settings.docuGateStallMs) : GATE_STALL_MS;
    for (let round = (readPv()?.round || 0) + 1; round <= PREVIEW_ROUNDS; round++) {
      if (round !== retryRound) { retryRound = round; gateRetries = 1; }
      // Doğrulama turu (docu-preview.js): bir önceki turun değiştirdiği sahneler; hiçbir şey değişmediyse kapı bitti.
      const prevPv = readPv();
      const only = round > FULL_ROUNDS && prevPv ? new Set(prevPv.changed || []) : null;
      if (only && !only.size) break;
      if (guard.skip("ön izleme (render öncesi kare denetimi)")) break;
      const watch = gateWatchdog({ stallMs: gateStallMs, killer });
      gateTouch = watch.touch;
      try {
        stagePatch(jobId, "media", 15, `Ön izleme ${round}/${PREVIEW_ROUNDS}: görsel, ses ve zamanlama hazırlanıyor (render yok)...`);
        await watch.race(runDocuEngine({
          scriptPath: engineFile, workDir, output: path.join(workDir, "prep-output.mp4"),
          srt: path.join(workDir, "prep-subs.srt"), thumbnail: path.join(workDir, "prep-thumb.jpg"),
          voiceId, settings, killer: watch.killer, prepareOnly: true,
          minSeconds: writerMade ? targetMinutes * 60 * 0.95 : 0,
          onLog: log2, onActivity: watch.touch,
          onProgress: engineProgress((p) => updateJob(jobId, p), { from: 15, span: 20 }),
        }), { own: true });
        if (isCancelled()) return;
        const prepared = readJson(path.join(workDir, `${docu.id}.props.json`), null)?.script;
        if (!prepared?.scenes?.length) break;
        // Kare çizimi sesi okumaz: sesler çıkarılır, görünüm kararları şimdiki senaryodan (tasarım kapısıyla aynı).
        const props = stillScript(prepared, engineDocu);
        stagePatch(jobId, "media", 36, only ? `Ön izleme ${round}/${PREVIEW_ROUNDS}: düzeltilen ${only.size} sahneye yeniden bakılıyor...` : `Ön izleme ${round}/${PREVIEW_ROUNDS}: her sahnenin karesi çiziliyor ve denetleniyor...`);
        const engineDir = docuEngineDir();
        const { placeTimeline } = await import(pathToFileURL(path.join(engineDir, "src", "timeline.js")).href);
        // Kare çizicinin her "kapak çizildi" satırı ilerlemedir (günlüğe yazılmaz): 183 kare ~19 dk sürdü.
        const pv = await watch.race(previewGate({
          props, scenes: engineDocu.scenes, placeTimeline, dir, settings, usage, logFn: log2, isCancelled: () => isCancelled() || watch.stalled,
          ffmpeg: settings.ffmpegPath || "ffmpeg", fp: sceneFp, round, only, people: peopleNames(directed), names: realNames(directed),
          render: (items) => renderWithEngine({
            items, props: { script: props }, assets: stillAssets(props, publicDir, engineDir),
            workDir: path.join(dir, "on-izleme-site"), killer: watch.killer, logFn: watch.touch,
          }),
        }));
        saveUsage();
        const { repick, ai, patches } = pv.plan;
        const before = readPv() || { ai: {}, patches: [] };
        const allPatches = mergePreviewPatches(before.patches, patches);
        // Kapının sahne sırası motorun senaryosu; AI notları ve düzeltme kayıtları yönetmenin sırasıyla (ses klibi araya girer).
        const toDirected = directedIndexes(directed.scenes, engineDocu.scenes);
        const allAi = { ...(before.ai || {}) };
        for (const a of ai) if (toDirected[a.scene] >= 0) allAi[toDirected[a.scene]] = a.note;
        const changed = [...new Set([...repick, ...ai, ...patches].map((f) => f.scene))].sort((a, b) => a - b);
        // Son turun düzeltmesine bir daha bakılamaz: kapı "temiz" demez, render sonrası denetim bunları ayrıca söyler.
        const lastRound = round >= PREVIEW_ROUNDS;
        // Düzeltilemeyen bulgu (bozuk karenin basamakları bitti, yalnızca raporlanan tür) kapıyı "temiz" yapmaz: openGateFindings.
        const open = openGateFindings(before.open, pv.report, changed);
        writeJson(pvFile, { docKey, round, at: new Date().toISOString(), ai: allAi, patches: allPatches, changed, clean: !changed.length && !open.length, ...(lastRound && changed.length ? { unverified: changed } : {}), ...(open.length ? { open } : {}), last: pv.report });
        if (!changed.length) {
          if (open.length) log2(`Ön izleme kapandı (tur ${round}): ${open.length} bulgu düzeltilemedi, render'a böyle gidiyor — ${findingList(open)}`);
          else log2(`Ön izleme temiz (tur ${round}): render'a giden her sahneye bakıldı, düzeltilecek sorun kalmadı`);
          break;
        }
        if (repick.length) {
          // Render sonrası otomatik düzeltmenin aynı yolu: reddedilen kaynak o sahnenin "uygun değil" listesine girer.
          // Arşiv aynı sahnede PICK_AI_AFTER kez yanlış verdiyse (ya da bu son tursa: yeni seçime bakılamaz) sahne AI'a
          // düşer — anlatımla güçlendirilmiş istem, arşiv seçicisi o sahneyi bir daha aramaz.
          const scenesFix = { ...(readFixes()?.scenes || {}) };
          let toAi = 0;
          for (const f of repick) {
            const at = toDirected[f.scene];
            const key = fixSceneKey(at, engineDocu.scenes[f.scene]);
            const c = sceneCredit(credits, engineDocu.scenes[f.scene], at);
            const rejected = [...new Set([...(scenesFix[key]?.rejected || []), ...stablePhotoRefs(c)].filter(Boolean))];
            // Araya giren ses klibi: yalnızca adresi reddedilir (kaynak video adımı koymaz); arşivde aranacak, AI'a düşecek sahnesi yok.
            if (at < 0) { scenesFix[key] = { rejected, kind: f.kind, detail: f.detail }; continue; }
            // tries: kaç kez yanlış kare bulundu (bir fotoğrafın dosya + sayfa adresi iki ret kaydıdır, sayılmaz).
            const tries = (scenesFix[at]?.tries || 0) + 1;
            const ai = lastRound || tries >= PICK_AI_AFTER;
            if (ai) toAi++;
            scenesFix[at] = { rejected, tries, kind: f.kind, detail: f.detail, ...(ai ? { ai: true } : {}) };
            // Not kapının notuyla aynı; anlatımdaki gerçek adlar "the person" olur (docu-preview.js aiNote, 27 Ekim 2026).
            if (ai && !allAi[at]) allAi[at] = aiNote(engineDocu.scenes[f.scene], realNames(directed));
          }
          if (toAi) writeJson(pvFile, { ...readJson(pvFile, {}), ai: allAi });
          writeJson(qaFixFile, { docKey, round: readFixes()?.round || 0, at: new Date().toISOString(), before: `ön izleme tur ${round}`, scenes: scenesFix });
          // Yalnızca ses klibi reddedildiyse arşiv geçişi silinmez (yeniden geçiş "uygun yok" sahneleri yeniden arar, seçici ücreti).
          const ids = repick.map((f) => toDirected[f.scene]).filter((i) => i >= 0);
          const removed = ids.length ? forgetArchivePicks(dir, directed, ids) : 0;
          log2(`Ön izleme: ${repick.length} sahnenin arşiv seçimi geçersiz sayıldı (${removed} kayıt)${toAi ? `, ${toAi} sahne arşivde tekrar tekrar yanlış kare verdiği için AI görseline geçiyor` : ""} — render'dan önce yeniden seçiliyor`);
        }
        const again = await watch.race(prepareEngineDocu());
        if (!again || isCancelled()) return;
        credits = again.credits;
        engineDocu = await watch.race(finishEngineDocu(again.engineDocu, credits, { fresh: true }));
        writeJson(engineFile, engineDocu);
      } catch (e) {
        if (isCancelled()) return;
        // GÖRSEL KUTUSU (Denizaltı/Kartal, 25 Ekim 2026): kapı zorunlu olunca kutu beklemesi "Ön izleme kapısı çalışmadı"
        // diye bitti; Commons dolgusu yalnızca render'ı sarıyordu, hiç çalışamadı. Kural kapı ve render için tek (inboxWaitAction).
        const { fillInboxFromCommons, inboxWaitAction } = await import("./inbox-commons.js");
        const inboxAct = inboxWaitAction(e, settings, { commonsTried });
        if (inboxAct === "commons") {
          commonsTried = true;
          log2("Görsel kutusu: AI görsel kredisi yok — eksikler Wikimedia Commons'tan gerçek fotoğrafla dolduruluyor");
          // Dolgunun kendi hatası (ör. Claude kredisi) işi kutu mesajından başka bir hatayla bitirmez.
          const filled = await fillInboxFromCommons({ jobDir: dir, settings, usage, ffmpeg: settings.ffmpegPath || "ffmpeg", logFn: log2 })
            .catch((x) => { log2(`Görsel kutusu: Commons dolgusu yapılamadı (${String(x?.message || x).slice(0, 160)})`); return 0; });
          saveUsage();
          log2(`Görsel kutusu: ${filled} görsel Commons'tan kondu`);
          if (isCancelled()) return;
          if (filled) { round--; continue; }
        }
        // Kutu beklemesi kapı arızası değildir: motorun kendi mesajıyla durur ("N görsel ChatGPT'den bekleniyor — LISTE.txt …").
        if (inboxAct) throw e;
        if (gateRetries-- > 0) {
          log2(`Ön izleme teknik hatayla durdu (${String(e?.message || e).slice(0, 160)}); kapı bir kez daha deneniyor`);
          await new Promise((r) => setTimeout(r, 15000));
          round--;
          continue;
        }
        // Kapısız render yok (kanal sahibi, 25 Ekim 2026: "uygulama hata yapmasın"): kapı çalışamadıysa iş render'dan
        // ÖNCE durur; "Kaldığı yerden devam et" kapıdan yeniden başlar (hazırlık ve görseller kayıtlı). docuPreviewRequired:false eski davranış.
        if (settings.docuPreviewRequired !== false) throw new Error(`Ön izleme kapısı çalışmadı — render başlatılmadı (${String(e?.message || e).slice(0, 200)})`);
        log2(`Ön izleme yarıda kaldı (${String(e?.message || e).slice(0, 200)}); render olduğu gibi devam ediyor — render sonrası denetim yalnızca raporlayacak`);
        break;
      } finally {
        watch.stop();
        gateTouch = () => {};
      }
    }
  }
  // Kapının düzeltemediği bulgular kalite uyarısıdır; kayıttan okunur, kapısı biten işin devamı da söyler.
  const gateOpen = readPv()?.open || [];
  if (gateOpen.length) quality.push(`Ön izleme kapısı ${gateOpen.length} bulguyu düzeltemedi: ${findingList(gateOpen)}`);

  // 6) MOTOR — görsel, ses, müzik, efekt, render, mastering
  stagePatch(jobId, "media", 15, "Sinematik motor başladı...");
  // Anahtar motor kodunu ve ses kütüphanesini de taşır: motor ya da kütüphane
  // değişince aynı senaryo yeniden render edilir (görsel/ses önbellekten, bedava).
  // Görsel kaynağı artık canlı ayardan (config.js): anahtar işin başladığı kaynağı taşır ki Ayarlar'da kaynağı değiştirmek
  // bitmiş videoyu aynı senaryoyla yeniden render ettirmesin (görseller önbellekte; boşa saatlerce CPU).
  const keyProvider = docuImageProvider(startedWith ? { ...settings, docuImageProvider: startedWith } : settings);
  const renderKeyOf = (ed) => [ed, voiceId, keyProvider, DOCU_ENGINE_VERSION, docuEngineFingerprint(), lib.version, musicSource];
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
      onProgress: engineProgress((p) => updateJob(jobId, p), { from: 15, span: 70 }),
    });
    if (isCancelled()) return;
    updateJob(jobId, { status: "prepared", stage: "prepared", progress: 85, message: "Hazırlandı — render sırası bekleniyor" });
    return;
  }
  // Otomatik düzeltme açıksa render parçaları ilk geçişten sonra saklanır: yeniden
  // seçilen sahneler yalnızca kendi parçalarını yeniden render ettirir.
  const qaOn = settings.docuQa !== false;
  // TEK RENDER (kanal sahibi, 18 Ekim 2026: "tek seferde o video bitecek, yeni mimari hani bunu çözmüştü"). Hürmüz
  // videosu ön izleme kapısından 2 turla geçti, yine de render'dan sonra kalite denetimi bir düzeltme turu daha açtı
  // (2. render), ardından 2 sahnelik yama bütün videoyu baştan çizdi (3. render). Ön izleme kapısından geçen video
  // render'dan sonra bir daha render'a girmez: kalite denetimi yalnızca raporlar (uyarılar + sonraki videoya ders).
  // Sondaki denetim HİÇBİR durumda kendiliğinden yeniden render açmaz (kanal sahibi, 25 Ekim 2026: "sonda niye var bu
  // kalite kontrolü"): kapı çalışmadıysa da yalnızca raporlar. Eski düzeltme turu yalnızca docuAutoFix:"always" ile.
  const gatePassed = !!readPv();
  const autoFix = qaOn && settings.docuAutoFix === "always";
  if (qaOn && gatePassed && !autoFix) {
    const pvEnd = readPv();
    const left = pvEnd?.unverified?.length || 0;
    const open = pvEnd?.open?.length || 0;
    log2(pvEnd?.clean
      ? `Tek render: ön izleme kapısı temiz (${pvEnd.round}. turda düzeltilecek sorun kalmadı) — render sonrası kalite denetimi yalnızca raporlayacak, yeniden render yok`
      : `Tek render: ön izleme kapısı ${pvEnd?.round || "?"} turda kapandı${left ? `, son turda düzeltilen ${left} sahneye bir daha bakılamadı` : ""}${open ? `, ${open} bulgu düzeltilemedi` : ""} — render sonrası kalite denetimi yalnızca raporlayacak, yeniden render yok`);
  }
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
        // Yama render: yalnızca bu sahnelerin parçaları yeni motorla çizilir (patchJob); bir kez kullanılır.
        patchScenes: Array.isArray(job.patchScenes) && job.patchScenes.length ? job.patchScenes : null,
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
  let rendered;
  try {
    rendered = await renderWith(engineDocu, { keepChunks: autoFix ? true : undefined });
  } catch (e) {
    /*
     * GÖRSEL KUTUSU → COMMONS (El Niño, Ekim 2026): OpenAI kredisi bitince motor AI görsellerini ChatGPT kutusuna
     * yazıp durur; iş sabaha kadar bekledi. Kutuyu bilerek seçmediysek (docuImageProvider "manual") Nova eksikleri
     * Commons'tan gerçek fotoğrafla doldurur ve bir kez daha dener.
     */
    const { fillInboxFromCommons, inboxWaitAction } = await import("./inbox-commons.js");
    if (inboxWaitAction(e, settings, { commonsTried }) !== "commons" || isCancelled()) throw e;
    commonsTried = true;
    log2("Görsel kutusu: AI görsel kredisi yok — eksikler Wikimedia Commons'tan gerçek fotoğrafla dolduruluyor");
    const filled = await fillInboxFromCommons({ jobDir: dir, settings, usage, ffmpeg: settings.ffmpegPath || "ffmpeg", logFn: log2 })
      .catch((x) => { log2(`Görsel kutusu: Commons dolgusu yapılamadı (${String(x?.message || x).slice(0, 160)})`); return 0; });
    log2(`Görsel kutusu: ${filled} görsel Commons'tan kondu`);
    if (!filled) throw e;
    rendered = await renderWith(engineDocu, { keepChunks: autoFix ? true : undefined });
  }
  // A patch is used once: the next render of this job is a normal one again.
  if (Array.isArray(job.patchScenes) && job.patchScenes.length) { updateJob(jobId, { patchScenes: null }); job.patchScenes = null; }
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
      const placed = await enginePlacement(script);
      // Zaman çizelgesi eleştirmeni (docu-critic.js, ücretsiz): uzun bekleyen kare, yavaş kanca, çağrı yeri, kısa video…
      let critic = [];
      try { critic = critiqueTimeline(script, placed, { sensitive: !!docu.sensitive }); } catch (e) { log2(`Zaman çizelgesi eleştirmeni çalışmadı: ${String(e?.message || e).slice(0, 120)}`); }
      if (critic.length) log2(`Eleştirmen (zaman çizelgesi): ${critic.length} bulgu — ${critic.slice(0, 4).map((x) => x.detail).join("; ")}`);
      const res = await qaVideo({
        video: path.join(rend.dir, "output.mp4"), script, placed, extraIssues: critic,
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
  /*
   * DÜZELT VE YENİDEN BAK (Ekim 2026, "Nova benden iyi çıkarmalı"): eleştirmenin "repick" dediği sahneler yeniden
   * seçilir, yalnızca değişen parçalar render edilir, sonra o video yeniden denetlenir; hâlâ düzeltilebilir sorun
   * varsa bir tur daha (Ayarlar: docuAutoFixRounds, varsayılan 2, en çok 3). Reddedilen kaynaklar turlar boyunca
   * birikir: ikinci tur birinci turun reddettiğine dönmez.
   */
  const maxRounds = Math.max(1, Math.min(3, Number(settings.docuAutoFixRounds) || 2));
  const fixNotes = [];
  let fixTried = false;
  for (let round = (readFixes()?.round || 0) + 1; round <= maxRounds; round++) {
    if (!(qa && autoFix && qa.fixable?.length) || guard.skip("otomatik düzeltme (sorunlu sahnelerin yeniden seçimi ve yeniden render)")) break;
    fixTried = true;
    const scenesFix = { ...(readFixes()?.scenes || {}) };
    // Denetimin sırası motorun senaryosu (ön izlemeyle aynı): kayıt ve arşiv seçimi yönetmenin sırasıyla.
    const toDirected = directedIndexes(directed.scenes, engineDocu.scenes);
    for (const f of qa.fixable) {
      const key = fixSceneKey(toDirected[f.scene], engineDocu.scenes[f.scene]);
      const c = sceneCredit(credits, engineDocu.scenes[f.scene], toDirected[f.scene]);
      scenesFix[key] = { rejected: [...new Set([...(scenesFix[key]?.rejected || []), ...stablePhotoRefs(c)].filter(Boolean))], kind: f.kind, detail: f.detail };
    }
    // HASTINGS (Ekim 2026): the re-pick needs the paid picker. With 0 credit it stopped at once, but the finished
    // archive pass (115 hand-checked pictures) was already deleted and the render chunks were dropped on the way
    // out — a later hook fix would have meant every scene searched again and a 2-hour full render. The pass and
    // the pick cache are kept aside and come back if the round fails; the chunks stay for the next fix.
    const keep = Object.fromEntries(["docu-archive-done.json", "docu-archive.json", "docu-qa-fixes.json"].map((f) => [f, readJson(path.join(dir, f), null)]));
    keep["docu-qa-fixes.json"] = readJson(qaFixFile, null);
    writeJson(qaFixFile, { docKey, round, at: new Date().toISOString(), before: qa.summary, scenes: scenesFix });
    const ids = qa.fixable.map((f) => toDirected[f.scene]).filter((i) => i >= 0);
    const removed = ids.length ? forgetArchivePicks(dir, directed, ids) : 0;
    log2(`Otomatik düzeltme (tur ${round}/${maxRounds}): ${qa.fixable.length} sahnenin arşiv seçimi geçersiz sayıldı (${removed} kayıt) — yeniden seçilip yalnızca değişen parçalar render edilecek`);
    try {
      stagePatch(jobId, "media", 93, `Kalite düzeltmesi (tur ${round}): ${qa.fixable.length} sahne yeniden seçiliyor...`);
      const prep2 = await prepareEngineDocu();
      if (!prep2 || isCancelled()) return;
      // İlk geçişle aynı son hazırlık (açılış hareketi, makale görüntüsü, düğme, damga, elle düzeltmeler).
      prep2.engineDocu = await finishEngineDocu(prep2.engineDocu, prep2.credits, { fresh: true });
      if (JSON.stringify(prep2.engineDocu) === JSON.stringify(engineDocu)) {
        log2("Otomatik düzeltme: yeniden seçim aynı görselleri verdi; yeniden render gerekmedi");
        break;
      }
      const rendered2 = await renderWith(prep2.engineDocu);
      if (isCancelled()) return;
      const qa2 = await runQa(rendered2, prep2.engineDocu);
      if (isCancelled()) return;
      fixNotes.push(`tur ${round}: ${qa.fixable.length} sahne yeniden seçildi ve render edildi (önce ${qa.issues.length} sorun, sonra ${qa2 ? qa2.issues.length : "?"})`);
      ({ engineDocu, credits } = prep2);
      rendered = rendered2;
      qa = qa2;
    } catch (e) {
      if (isCancelled()) return;
      log2(`Otomatik düzeltme tamamlanamadı (${String(e?.message || e).slice(0, 200)}); son render teslim ediliyor`);
      writeJson(engineFile, engineDocu);
      const back = restoreAfterFailedFix(dir, keep);
      if (back) log2(`Otomatik düzeltme geri alındı: ${back} (render parçaları sonraki düzeltme için saklanıyor)`);
      break;
    }
  }
  if (fixNotes.length) fixNote = `Otomatik düzeltme — ${fixNotes.join("; ")}.`;
  if (!fixTried && autoFix && !rendered.degraded) dropRenderChunks(workDir);
  if (fixNote) log2(fixNote);

  // 7) ÇIKTILAR
  stagePatch(jobId, "finalize", 95, "Çıktılar yazılıyor...");
  const { durationSec, sectionTimes } = rendered;
  for (const w of rendered.warnings || []) quality.push(w);
  if (rendered.degraded) quality.push('Bazı varlıklar eksik kaldı — Kütüphane\'den "Yeniden render / eksikleri tamamla" yalnızca eksikleri yeniden dener.');
  if (fixNote) quality.push(fixNote);
  for (const w of qa?.warnings || []) quality.push(w);
  if (writerMade && durationSec < targetMinutes * 60) quality.push(`Video hedeften kısa: ${durationLabel(durationSec)} (hedef ≥ ${targetMinutes} dk).`);
  const muzikler = seoMusicList(rendered.musicCues);
  fs.writeFileSync(path.join(rendered.dir, "seo.md"), renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, withInboxCredits(dir, credits), muzikler.length ? muzikler : null), "utf8");
  publishRevision(dir, rendered);
  writeJson(path.join(dir, "seo.json"), seo);

  // 7b) YOUTUBE PAKETİ — 3 kapak + 5 başlık (docu-package.js): videonun kendi görselleri,
  // görme modeliyle sıralama, Opus planı, motorda çizim, 320x180 okunurluk denetimi.
  // Videodan bağımsız: kredi yoksa belirleyici yedek, çökerse video yine teslim edilir.
  let pkg = null;
  if (settings.docuPackage !== false) {
    stagePatch(jobId, "finalize", 97, "YouTube paketi: kapaklar ve başlıklar...");
    // Bir kez yeniden denenir (El Niño, Ekim 2026: kapak çizicinin tarayıcısı yük altında 25 sn'de bağlanamadı, paket hiç çıkmadı).
    for (let attempt = 1; attempt <= 2 && !pkg; attempt++) {
      try {
        pkg = await runDocuPackage({ jobDir: dir, job: { ...job, id: jobId }, settings, usage, logFn: log2, isCancelled, killer, ffmpeg: settings.ffmpegPath || "ffmpeg" });
        saveUsage();
      } catch (e) {
        if (isCancelled()) return;
        if (attempt === 1) { log2(`YouTube paketi hazırlanamadı (${String(e?.message || e).slice(0, 200)}); 30 sn sonra bir kez daha deneniyor`); await new Promise((r) => setTimeout(r, 30000)); }
        else log2(`YouTube paketi hazırlanamadı (${String(e?.message || e).slice(0, 200)}); video paketsiz teslim ediliyor`);
      }
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
  log2(`Video hazır: ${durationLabel(durationSec)}, ${docu.scenes.length} sahne`);
  /*
   * SHORTS DA NOVA'NIN İŞİ (kanal sahibi, Ekim 2026: "kredin bitince Nova tek başına çıkaracak"; izlenmenin ~%80'i
   * Shorts'tan): video bitince docuAutoShorts kadar Short (varsayılan 2) kendi kapağı ve başlığıyla üretilir — her
   * yenisi öncekilerden farklı açıdan (earlierShorts). Short hatası videoyu etkilemez.
   */
  const autoShorts = Math.max(0, Math.min(3, Number(settings.docuAutoShorts ?? 2) || 0));
  if (autoShorts && !isCancelled()) {
    for (let k = 1; k <= autoShorts && !isCancelled(); k++) {
      try {
        log2(`Shorts ${k}/${autoShorts} hazırlanıyor...`);
        const m = await makeDocuShort({ jobDir: dir, settings, ffmpeg: settings.ffmpegPath || "ffmpeg", title: docu.title, logFn: log2 });
        log2(`Shorts ${k}/${autoShorts} hazır: ${path.basename(m.file)} — "${m.title}"`);
        saveUsage();
      } catch (e) {
        log2(`Shorts ${k}/${autoShorts} üretilemedi (${String(e?.message || e).slice(0, 200)})`);
      }
    }
  }
}

/** Hazır bir docu senaryosuyla iş başlatmak için (ör. örnek video): senaryoyu işin klasörüne koyar. */
export function seedDocuScript(dir, docu, id) {
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, "docu-script.json"), { ...stripChapterCards(docu), id });
}
