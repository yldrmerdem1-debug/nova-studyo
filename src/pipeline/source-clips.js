// KAYNAK VİDEO (1.16.19, 20 Ekim 2026) — olayın GERÇEK görüntüsü ve kişinin KENDİ sesi.
//
// Kanal sahibi: "kaynak videolardan tiktok o bu şu videolar koymak işe yaramış gibi, önemli, bunu çekebilmeli".
// Küçük kanal patlamaları kare kare (D:\Nova Studyo\quality-review\breakout-study-20261016):
//   - Base Central (98 abone, 58 bin): Mickey Rourke'un KENDİ videosuyla, kendi sesi + altyazıyla açılıyor; köşede
//     "Mickey Rourke, his own video, January 2026"; sonra "Mickey Rourke, 1986" film klibi; KTLA / ABC7 haber klipleri
//     logolarıyla, üstünde anlatıcı ve büyük sayı kartları.
//   - Statrys (393 abone, 871 bin): kurucunun kendi röportaj klipleri isim etiketiyle, sözleri alıntı olarak ekranda.
//   - Wrongly Assumed (1 milyon): el yazmasını tutan gerçek belgesel görüntüleri, "MS 408" etiketi.
// Bizim Panama videomuz (tanık videolarıyla) kanalın en iyi tutan uzun videosu oldu (%45).
//
// Akış (senaryo + arşivden SONRA, render'dan önce; sonuç işe kaydedilir, yeniden ödenmez):
//   1) Claude anlatımdan en çok 8 "olay" anı (gerçek görüntüsü olan yer/olay/nesne) ve en çok 2 "ses" anı (adı geçen
//      kişinin kendi söylediği söz) seçer, her biri için YouTube araması yazar.
//   2) yt-dlp ile arama; büyük TV/ajans kanalları (Content ID) elenir; olay için videonun en çok izlenen anı
//      (heatmap), ses için altyazıda sözün geçtiği yer bulunur; yalnızca o 3-8 saniye indirilir.
//   3) Görme modeli kareye bakar: anlatımdaki şeyi gösteriyor mu? Ret nedeni log'a yazılır; ret yalnızca o kareye
//      aitse (stüdyo spikeri, büyük ekran yazısı, uymuyor) aynı videonun en çok 2 başka anı, sonra sıradaki aday (en çok 5).
//   4) Olay klibi sahnenin görüntüsü olur (anlatım üstünde, klip sessiz); ses klibi anlatım satırının ARDINA kendi
//      sahnesi olarak girer, kişinin sesi ve altyazısıyla. Köşede "kaynak · tarih" etiketi; künye açıklamaya.
// Sınırlar: kliplerin toplamı videonun en çok %18'i, tek klip en çok 8 sn; kaynağın logosu/filigranı ASLA kesilmez
// ya da kapatılmaz (etiket köşede küçük, görüntünün üstüne değil).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { callJSON, callVisionJSON, callText, isTransientNet } from "../llm.js";
import { readJson, writeJson, DATA_DIR } from "../util.js";
import { footageHold, HOLD_LIMITS, isCallToAction } from "./footage-hold.js";
import { isMonochrome, measureSaturation } from "./media.js";

export const SOURCE_LIMITS = { events: 8, voices: 2, maxClipSec: 8, minClipSec: 3, shareMax: 0.18 };
/*
 * HABER KANALI (1.16.21, kanal sahibi: "anlattığı şeyin videosu çıksa insanlar daha çok izler… gündem kanalına tam oturur"):
 * gündemde olayın kendisi filme alınmıştır — klip payı ~%33, olay anı en çok 14, sosyal medya araması en çok 5.
 */
export const NEWS_LIMITS = { ...SOURCE_LIMITS, events: 14, shareMax: 0.33 };
export const limitsFor = ({ news = false } = {}) => (news ? NEWS_LIMITS : SOURCE_LIMITS);
export const SOCIAL_MAX = 5;

/*
 * KLİBİN SINIRLARI (Denizaltı çarpışması, 24 Ekim 2026): kancada 2560 px müze fotoğrafının yerine 480x348, 10 fps, başka
 * bir denizaltının klibi girdi ve fotoğrafın "LE TRIOMPHANT · FRENCH NAVY" yazısı klibin üstünde kaldı. Uzun kenarı
 * 640 px'ten küçük klip hiç alınmaz; sahnede zaten ≥1280 px gerçek fotoğraf varsa 720p altı klip onun yerine geçmez.
 * Saniyede 12 kareden az klip de alınmaz: 30 fps grafiklerin arasında takılarak oynar (kare hızını yazmayan klipte kural
 * yok). Taban 20 değil 12: güvenlik kamerası, tanık telefonu ve eski haber görüntüsü çoğu zaman 12-15 fps'tir ve haberin
 * asıl değeri o görüntüdür; ölçülen 10 fps klip zaten 640 px kuralına da takılıyordu.
 */
export const CLIP_MIN_PX = 640;
export const CLIP_MIN_FPS = 12;
const STILL_KEEP_PX = 1280, CLIP_HD_PX = 720;
/**
 * Vikipedi maddesini slayt gösterisine çeviren kanallar (Wiki4All): görüntü değil, başkasının fotoğrafı bizim künyemizde.
 * WikiLeaks slayt kanalı değil: kendi basın toplantıları ve yayımladığı özgün görüntüler.
 */
const SLIDESHOW_CHANNELS = /wiki(?!leaks)|audiopedia/i;
/**
 * Oyuncularla canlandırılmış TV belgesel dizileri ve yeniden kurgu (inceleme, 28 Ekim 2026): Gimli 20261028-9ff721'de
 * sahne 110 "Mayday: Air Disaster" kanalının canlandırmasıydı (Cineflix, Content ID), kanca klibi de aynı dizinin
 * "Havacılık Kazaları" yüklemesi — karede o programın Türkçe "Robert Pearson" isim kartı ve vesikalığı vardı. Etiketi
 * "Video: kanal · yıl" olunca oyuncu sahnesi gerçek olay görüntüsü diye okunur. Kanal ya da BAŞLIK tutarsa aday olmaz;
 * başlığında dizinin adı geçmeyen yüklemeyi görme denetiminin reenactment bayrağı yakalar.
 */
export const DRAMATIZED = /\b(?:Mayday|Air Crash Investigation|Air Disasters|Seconds From Disaster|Why Planes Crash|Nat(?:ional)? ?Geo(?:graphic)?|Smithsonian Channel|Discovery(?: Channel| UK)?|History Channel|Cineflix|Curiosity ?Stream|re-?enact(?:ment|ed)|dramati[sz](?:ation|ed)|docudrama|reconstruction|recreation)\b/i;

/**
 * Content ID ile telif talebi atan büyük TV/ajans kanalları (kanal adında geçen). docuSourceClipsBroadcast:true açar.
 * Brezilya ve İsrail yayıncıları (inceleme, 27 Ekim 2026): Lula 20261026-29db03'te Record'un miting görüntüsü ("JR" logosu,
 * #JornalDaRecord) başka bir kanalın yüklemesiydi; küçük TV logosu artık klibi düşürmediği için yayıncının KENDİ hesabı
 * burada elenir (Globo, Record, SBT, Band, CNN Brasil, Jovem Pan, TIME; sıradaki İsrail seçim videosu için Kan, N12/Kanal
 * 12, Kanal 13, Kanal 14, i24NEWS, Times of Israel). Sıradan kanal adı tutmasın diye kısa adlar (TIME, Band, Record, Kan)
 * yalnızca kanalın adının TAMAMIYSA sayılır: "Real Time History", "Big Band Swing", "Guinness World Records" geçer.
 */
export const BROADCASTERS = /\b(CNN|BBC|Sky News|Reuters|Associated Press|AP Archive|NBC|CBS|ABC News|Fox News|FOX \d|Al Jazeera|DW News|France 24|ITV|Channel 4|Euronews|CNBC|Bloomberg|MSNBC|PBS|CBC|TRT World|WION|Times Radio|The Guardian|New York Times|Washington Post|Wall Street Journal|Getty|Storyful|British Path[eé]|NewsX|NDTV|India Today|Times Now|Republic|Al Arabiya|GB News|CNA|Channel NewsAsia|Global News|CTV|7NEWS|9 News|KTLA|ABC7|ABC 7|WFAA|Inside Edition|TMZ|Daily Mail|The Sun|Telegraph|Independent|Forbes|AFP|Agence France|Anadolu|Xinhua|CGTN|RT|Press TV|Tasnim|IRNA|Nikkei|Times Of India|Hindustan Times|DNA ?India|Firstpost|Mint|ANI|Zee News|Economic Times|New York Post|NY Post|Daily Express|Mirror|Metro|LBC|Newsweek|USA TODAY|Yahoo|Le Parisien|Le Monde|Le Figaro|Lib[eé]ration|BFM ?TV|BFM|TF1|France ?2|France ?3|France ?Info|franceinfo|LCI|CNews|Ouest[- ]France|La Provence|Le Point|L.Express|Paris Match|CLPRESS|Agence de presse|Bild|Der Spiegel|SPIEGEL|ZDF|ARD|Tagesschau|BR24|Bayerischer Rundfunk|n-tv|RTL|Sky Deutschland|Corriere|La Repubblica|RAI|El Pa[ií]s|RTVE|Antena 3|TV ?Globo|Globo ?News|Globoplay|Globo|Record ?TV|TV ?Record|Record News|Jornal da Record|Rede Record|SBT|Band ?News|Band Jornalismo|Jornal da Band|Bandeirantes|CNN Brasil|Jovem Pan|i24 ?NEWS|i24|Kan News|Kan 11|KAN [-–] Israel|Israeli Public Broadcasting|N12|Channel 1[234]|Keshet 12|Reshet 13|Now 14|Times of Israel)\b|\bNews\s?(?:Live|Network|Channel|HD|24|TV)\b|\b(?:Live|24)\s?News\b|כאן חדשות|כאן 11|תאגיד השידור|חדשות 12|חדשות 13|ערוץ 14|עכשיו 14|^\s*(?<solo>TIME|Band|Record|Kan)(?:\s+\k<solo>)?\s*$/i;

const sha = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 10);
const words = (s) => String(s || "").toLowerCase().replace(/\[[^\]]*\]/g, " ").match(/[\p{L}\p{N}']+/gu) || [];
const STOP = new Set("the a an of in on at to and or for with by from is was were his her their its that this as it be are he she they we you i".split(" "));
const content = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Ret listesi anahtarı. YouTube'un her adres biçimi (watch?v=, youtu.be/, shorts/, embed/) aynı video; diğer
 * adreslerde şema, www ve sorgu/izleme eki atılır. Sahne numarasıyla değil adresle eşleşir: ses klipleri araya
 * sahne olarak girdiği için motorun sahne numaraları senaryonunkinden kayar.
 */
export function clipKey(url) {
  const u = String(url || "").trim();
  const yt = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i.exec(u);
  if (yt) return `youtube:${yt[1]}`;
  return u.replace(/^https?:\/\/(?:www\.|m\.|mobile\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}
const rejectedKeys = (list) => new Set([...(list || [])].map(clipKey).filter(Boolean));
const pickRejected = (p, ret) => ret.size > 0 && [p.url, /^[\w-]{11}$/.test(String(p.id || "")) ? `https://www.youtube.com/watch?v=${p.id}` : ""].some((u) => u && ret.has(clipKey(u)));

/**
 * Olaydan ÖNCE yüklenmiş görüntü o olayı gösteremez (Fransa, 20 Ekim 2026: 2026 sonbahar eylemleri anlatılırken 2018
 * "loi Vidal" öğrenci eyleminin klibi girdi, pankartlar 2018'in). year = olayın yılı (planın verdiği), 0 = bilinmiyor.
 */
export function predatesEvent(uploadDate, year) {
  const y = /^(\d{4})/.exec(String(uploadDate || ""));
  return Number(year) > 0 && !!y && +y[1] < Number(year);
}

/** Olay klibi bu sahneye girmez mi? Neden (log için) ya da "". */
export function clipVeto(s, { w, h, fps } = {}) {
  const W = Number(w) || 0, H = Number(h) || 0, F = Number(fps) || 0;
  if (Math.max(W, H) < CLIP_MIN_PX) return `${W}x${H}, çok küçük`;
  if (F > 0 && F < CLIP_MIN_FPS) return `${+F.toFixed(2)} fps, takılarak oynar`;
  // Fotoğrafın uzun kenarı: dikey portre (1080x1920) de yüksek çözünürlüklü gerçek fotoğraftır.
  const still = s?.archived && s?.image && !s?.video ? Math.max(Number(s.imgW) || 0, Number(s.imgH) || 0) : 0;
  if (still >= STILL_KEEP_PX && Math.min(W, H) < CLIP_HD_PX) return `${W}x${H}, sahnenin ${s.imgW || "?"}x${s.imgH || "?"} gerçek fotoğrafından zayıf`;
  return "";
}

/** yt-dlp yolu: ayar → data/tools/yt-dlp.exe → PATH. */
export function ytdlpPath(settings = {}) {
  const c = [settings.ytdlpPath, path.join(DATA_DIR, "tools", "yt-dlp.exe"), path.join(DATA_DIR, "tools", "yt-dlp")].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || "yt-dlp";
}
/** YouTube çözümü için JS çalışma zamanı (yt-dlp --js-runtimes). Electron'un kendisi node değil. */
export function nodeRuntime(settings = {}) {
  const c = [settings.nodePath, "C:\\Program Files\\nodejs\\node.exe", "/usr/bin/node", "/usr/local/bin/node"].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || null;
}

/*
 * ANA SÜREÇTE EŞZAMANLI ÇAĞRI (25 Ekim 2026, denizaltı işi 48 dk dondu): spawnSync, çocuk bitene kadar uygulamanın
 * bütün Node olay döngüsünü (arayüz, API, iş günlüğü) durdurur. Bu dosyadaki her yt-dlp/ffmpeg çağrısının bir tavanı
 * var; dolunca süreç SIGKILL ile öldürülür (SIGTERM'i yok sayan bir süreçte spawnSync yine beklerdi) ve sonuç
 * (status null, error ETIMEDOUT) başarısızlık sayılır. ffmpeg'e -nostdin: girdiden tuş beklemez.
 */
/** Varsayılan yt-dlp çalıştırıcı: {status, stdout, stderr}. Testler kendi çalıştırıcısını verir. */
export function defaultYtdlp(settings = {}) {
  const bin = ytdlpPath(settings);
  const node = nodeRuntime(settings);
  return (args, { timeoutMs = 180000 } = {}) => {
    const full = [...(node ? ["--js-runtimes", `node:${node}`] : []), "--no-warnings", ...args];
    const r = spawnSync(bin, full, { encoding: "utf8", windowsHide: true, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 64 << 20 });
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || String(r.error?.message || "") };
  };
}

/* ------------------------------------------------------------------ plan */

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    moments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "integer" },
          kind: { type: "string", enum: ["event", "voice"] },
          query: { type: "string", description: "YouTube search, English, 3-8 words, the real event/place/person — e.g. 'Mickey Rourke rent fundraiser video', 'tanker fire Strait of Hormuz footage'" },
          who: { type: "string", description: "voice: the person whose own words these are; event: '' " },
          quote: { type: "string", description: "voice: the words the person is known to have said (as in the narration); event: ''" },
          why: { type: "string" },
          year: { type: "integer", description: "the year the filmed EVENT or statement happened, from the narration (a protest, fire, launch, collision, speech); 0 for a place, building or object that looks the same in any year, or if unknown" },
          span: { type: "integer", description: "event: how many of the lines RIGHT AFTER #scene still describe what this same footage shows (0-4); voice: 0" },
        },
        required: ["scene", "kind", "query", "who", "quote", "why", "year", "span"],
        additionalProperties: false,
      },
    },
  },
  required: ["moments"],
  additionalProperties: false,
};

/** Anlatım satırları (Claude'un gördüğü liste). Kart/başlık/harita gibi kendi görüntüsünü çizen sahneler hariç. */
export function sourceCandidates(script) {
  // İzleyici çağrısı (beğen/abone/Hype) gerçek olay görüntüsünün üstüne düşmez (footage-hold.js).
  return (script?.scenes || []).map((s, i) => ({ s, i })).filter(({ s }) => s?.say && ["photo", "words"].includes(s.type) && !s.name && !s.outro && !(s.type === "title" && s.chapterCard) && !isCallToAction(s));
}

export async function planSourceMoments(script, { llm = callJSON, settings = {}, usage, logFn = () => {}, news = false } = {}) {
  const L = limitsFor({ news });
  const list = sourceCandidates(script);
  const first = list.slice(0, 3).map(({ i }) => i);
  if (!list.length) return [];
  const lines = list.map(({ s, i }) => `#${i} ${String(s.say).replace(/\[[^\]]*\]/g, "").trim()}`).join("\n");
  // Haber anlatımı çoğu zaman yıl söylemez (Fransa: "This autumn the fight spilled into the streets"): bugünün tarihi
  // verilmezse plan o anın yılını bilemez, 0 yazar ve 2018 klibi yine girerdi.
  const today = new Date().toISOString().slice(0, 10);
  const user = [
    `VIDEO: ${script.title || ""}`,
    "",
    "Narration lines (#scene):",
    lines,
    "",
    `Pick at most ${L.events} EVENT moments and at most ${L.voices} VOICE moments where REAL footage (YouTube, TikTok, X) would beat any still:`,
    "- event: the line describes a real event, place, object or scene that was filmed (the fire, the protest, the launch, the ship, the street, the person's own video). Prefer the first two minutes and the climax. Not for general statements, numbers or analysis.",
    "- voice: the line attributes concrete words to a named, real person (a statement, an interview, a press conference, their own social video). The quote must be words they actually said in public.",
    "- query: what a viewer would type to find that exact footage; eyewitness or the person's own channel first. Never a TV channel name.",
    `- year: today is ${today} — "this autumn", "last week" count from it. 0 for a place, building or object that looks the same in any year.`,
    // Kanca klibi: haber kanallarında ilk saniyeler olayın kendisidir (kanal sahibi: "başa koymak iyi olabilir").
    `- HOOK: if the story was filmed at all, one EVENT moment must be on one of the first lines (#${first.join(", #")}) — the most striking filmed moment, it opens the video.`,
    // Reklam güvenliği (kanal sahibi onayı, 22 Ekim 2026): gerilim girer, darbe girmez.
    "- AD-SAFE: tension yes (crowds running, police lines, fire, smoke, sirens, damage); never a moment whose footage would show blood, injured or dead people, a person being beaten, or a weapon fired at someone.",
    // Kanal sahibi (28 Ekim 2026): "videolar çok hızlı geçiliyor… anlatıma tam uyuyorsa 30 sn'likte koyulabilir".
    `- span (event): how many of the lines RIGHT AFTER #scene still describe what this same footage shows — the same place and the same moment, nothing new the viewer must see (no new person, place, map, number or date). The footage then keeps playing under those lines, up to ${HOLD_LIMITS.maxSec} seconds in all. 0 when the next line moves on. Never across a call to action.`,
    "Return fewer moments rather than weak ones.",
  ].join("\n");
  try {
    const res = await llm({ system: "You are a documentary archive producer who finds real footage on YouTube. Return only the requested JSON.", user, schema: PLAN_SCHEMA, model: settings.docuFastModel || "claude-sonnet-5-5", maxTokens: 3000, usage, logFn });
    const ok = new Set(list.map(({ i }) => i));
    const out = [];
    let ev = 0, vo = 0;
    for (const m of res?.moments || []) {
      if (!ok.has(m.scene) || !String(m.query || "").trim()) continue;
      if (m.kind === "voice" ? vo++ >= L.voices : ev++ >= L.events) continue;
      if (out.some((x) => x.scene === m.scene && x.kind === m.kind)) continue;
      // Gelecekteki yıl (model yanılgısı) her klibi "olaydan önce yüklenmiş" sayardı: an kalır, yıl taşınmaz.
      const y = Math.trunc(Number(m.year)) || 0;
      const year = y <= +today.slice(0, 4) ? y : 0;
      const span = m.kind === "voice" ? 0 : Math.max(0, Math.min(HOLD_LIMITS.maxLines, Math.trunc(Number(m.span)) || 0));
      out.push({ scene: m.scene, kind: m.kind === "voice" ? "voice" : "event", ...(m.kind !== "voice" && first.includes(m.scene) ? { hook: true } : {}), query: String(m.query).slice(0, 90), who: String(m.who || "").slice(0, 60), quote: String(m.quote || "").slice(0, 300), ...(year > 0 ? { year } : {}), ...(span ? { span } : {}) });
    }
    return out;
  } catch (e) {
    // "Plan an bulmadı" ile "plan düştü" ayrı (kod okuması, 25 Ekim 2026): kredi/anahtar/bağlantı yüzünden düşen plan []
    // dönseydi attachSourceClips "an yok" kaydederdi, kredi yüklenince de o anlatım bir daha aranmazdı. Adım durur
    // (docu.js "Kaynak video atlandı"), sonraki çalıştırmada yeniden planlanır.
    const gone = notDecided(e);
    if (gone) {
      logFn(`Kaynak video planı yazılamadı (${gone}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`);
      throw e;
    }
    logFn(`Kaynak video planı yazılamadı (${String(e?.message || e).slice(0, 140)})`);
    return [];
  }
}

/* ----------------------------------------------------------------- arama */

/** yt-dlp arama sonucu → adaylar; büyük TV/ajans kanalları ve uygunsuz süreler elenir, sorguya yakın olan önce. */
export function rankSearch(entries, query, { broadcast = false } = {}) {
  const q = new Set(content(query));
  return (entries || [])
    .filter((e) => e?.id && Number(e.duration) >= 8 && Number(e.duration) <= 2400)
    .filter((e) => broadcast || !BROADCASTERS.test(`${e.channel || ""} ${e.uploader || ""}`))
    .filter((e) => !SLIDESHOW_CHANNELS.test(`${e.channel || ""} ${e.uploader || ""}`) && !/audio article/i.test(e.title || ""))
    .filter((e) => !DRAMATIZED.test(`${e.channel || ""} ${e.uploader || ""} ${e.title || ""}`))
    .map((e) => {
      const t = content(e.title);
      const hit = t.filter((w) => q.has(w)).length;
      const short = Number(e.duration) <= 600 ? 1 : 0;
      return { id: e.id, title: String(e.title || ""), channel: String(e.channel || e.uploader || ""), duration: Number(e.duration), score: hit * 2 + short };
    })
    .filter((e) => e.score >= 2)
    .sort((a, b) => b.score - a.score);
}

export function searchYouTube(query, { ytdlp, n = 8 } = {}) {
  const r = ytdlp(["--flat-playlist", "-J", `ytsearch${n}:${query}`], { timeoutMs: 90000 });
  if (r.status !== 0) return [];
  try {
    return JSON.parse(r.stdout).entries || [];
  } catch {
    return [];
  }
}

/** Videonun tam bilgisi (heatmap, yükleme tarihi, altyazı adresleri). */
export function videoInfo(id, { ytdlp }) {
  const r = ytdlp(["-J", "--skip-download", "--", id], { timeoutMs: 120000 });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/** Olay anı: en çok tekrar izlenen bölüm (heatmap) — yoksa videonun %12'si (girişi atlar). */
export function eventWindow(info, { want = 6, cap = SOURCE_LIMITS.maxClipSec } = {}) {
  const dur = Number(info?.duration) || 0;
  if (!dur) return null;
  // Uzun tutulacak an (plan `span`): pencere satırların toplamı kadar, en çok HOLD_LIMITS.maxSec.
  const len = Math.min(want, Math.min(cap, HOLD_LIMITS.maxSec), dur);
  const hm = Array.isArray(info?.heatmap) ? info.heatmap.filter((h) => Number.isFinite(h?.start_time)) : [];
  // İlk %3 (kanal girişi, logo) ve son %5 (bitiş ekranı) sayılmaz.
  const pool = hm.filter((h) => h.start_time > dur * 0.03 && h.end_time < dur * 0.95);
  let start = pool.length ? pool.reduce((a, b) => (b.value > a.value ? b : a)).start_time : dur * 0.12;
  start = Math.max(0, Math.min(start, dur - len));
  return { start: +start.toFixed(2), end: +(start + len).toFixed(2) };
}

/*
 * AYNI VİDEONUN BAŞKA ANI (Kartal Yuvası 20261024-950730, 24 Ekim / Lula 20261026-29db03, 26 Ekim 2026): görme
 * denetimi bir videonun TEK karesine bakıyordu; o kare stüdyoya, isim kartına ya da başlık kartına denk gelince video
 * bütünüyle atılıyordu. Kartal'da reddedilen yangın videolarının poster kareleri: isim kartlı bir polis sözcüsü,
 * "MARTIN BORMANN" başlık kartı; Lula'da Record'un köşe logolu miting görüntüsü ("Lula ends campaign in São Paulo")
 * atıldı. 12 an arandı 5'i, 10 an arandı 2'si yerleşti.
 * İlk pencere eventWindow'un seçtiği (en çok izlenen an); sonra öteki heatmap tepeleri, yoksa videonun %35/%60/%80'i.
 * Pencereler birbirine binmez (araları en az pencere + 2 sn ve videonun %10'u), giriş (%3) ve bitiş ekranı (%5) hariç.
 */
export function eventWindows(info, { want = 6, n = 3, cap = SOURCE_LIMITS.maxClipSec } = {}) {
  const first = eventWindow(info, { want, cap });
  if (!first) return [];
  const dur = Number(info.duration);
  const len = first.end - first.start;
  const out = [first];
  const gap = Math.max(len + 2, dur * 0.1);
  const lo = dur * 0.03, hi = dur * 0.95;
  const hm = Array.isArray(info?.heatmap) ? info.heatmap.filter((h) => Number.isFinite(h?.start_time) && h.start_time > lo && h.end_time < hi) : [];
  const peaks = [...hm].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).map((h) => h.start_time);
  for (const at of [...peaks, dur * 0.35, dur * 0.6, dur * 0.8]) {
    if (out.length >= n) break;
    const start = Math.max(0, Math.min(at, dur - len));
    if (start < lo || start + len > hi || out.some((w) => Math.abs(w.start - start) < gap)) continue;
    out.push({ start: +start.toFixed(2), end: +(start + len).toFixed(2) });
  }
  return out;
}

/** json3 altyazı → [{t, d, text}] */
export function parseJson3(j) {
  return (j?.events || []).filter((e) => e.segs).map((e) => ({ t: (e.tStartMs || 0) / 1000, d: (e.dDurationMs || 0) / 1000, text: e.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim() })).filter((c) => c.text);
}

/** Ses anı: sözün en çok örtüştüğü altyazı penceresi (3-8 sn). Örtüşme zayıfsa null. */
export function voiceWindow(cues, quote) {
  const q = content(quote);
  if (q.length < 3 || !cues?.length) return null;
  const qs = new Set(q);
  let best = null;
  for (let a = 0; a < cues.length; a++) {
    let txt = "";
    for (let b = a; b < cues.length && cues[b].t - cues[a].t <= SOURCE_LIMITS.maxClipSec; b++) {
      txt = `${txt} ${cues[b].text}`.trim();
      const w = content(txt);
      const hit = [...new Set(w)].filter((x) => qs.has(x)).length;
      const share = hit / qs.size;
      const end = cues[b].t + Math.max(0.8, cues[b].d);
      if (end - cues[a].t < SOURCE_LIMITS.minClipSec) continue;
      if (!best || share > best.share) best = { start: cues[a].t, end: Math.min(end, cues[a].t + SOURCE_LIMITS.maxClipSec), text: txt, share };
    }
  }
  return best && best.share >= 0.6 ? { start: +best.start.toFixed(2), end: +best.end.toFixed(2), text: best.text } : null;
}

/** Köşe etiketi: "kanal · Ay Yıl" (yükleme tarihi). */
export function sourceLabel({ channel, uploadDate, who }) {
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = /^(\d{4})(\d{2})/.exec(String(uploadDate || ""));
  const when = d ? `${M[+d[2] - 1]} ${d[1]}` : "";
  const src = who ? `${who}, via ${channel}` : `Video: ${channel}`;
  return [src, when].filter(Boolean).join(" · ").slice(0, 70);
}

/** Toplam klip payı sınırı: önce sıradaki anlar, toplam tahmini sürenin %18'ini geçmez. */
export function withinShare(moments, totalSec, clipSec = 6, { news = false } = {}) {
  // Uzun tutulan an (`want`) payı kendi uzunluğuyla yer; ötekiler clipSec sayılır.
  const budget = Math.max(clipSec, totalSec * limitsFor({ news }).shareMax);
  // Kanca klibi sınıra takılmaz: önce o.
  const out = [];
  let used = 0;
  for (const m of [...moments.filter((x) => x.hook), ...moments.filter((x) => !x.hook)]) {
    const sec = Number(m.want) > 0 ? Number(m.want) : clipSec;
    if (out.length && used + sec > budget) continue;
    out.push(m);
    used += sec;
  }
  return out;
}

/* ------------------------------------------------------- sosyal medya */

/*
 * TIKTOK / X / TELEGRAM (1.16.21, kanal sahibi: "nerden bulacak?"): görgü tanığı videolarının çoğu oralarda, ama yt-dlp
 * o sitelerde arama yapamaz — yalnızca verilen adresi indirir. YouTube'da uygun klip çıkmayan olay anı için Claude web
 * aramasıyla doğrudan gönderi adreslerini bulur; yt-dlp yalnızca pencereyi indirir. Kanal adı yerine hesap adı etikete
 * yazılır; ajans/TV hesapları aynı listeyle elenir.
 */
const SOCIAL_URL = /https?:\/\/(?:www\.|m\.|vm\.|mobile\.)?(?:tiktok\.com|x\.com|twitter\.com|instagram\.com|t\.me|youtube\.com\/shorts|reddit\.com)\/[^\s)\]"'<>]+/gi;

/** Metindeki gönderi adresleri (arama/etiket sayfaları hariç), en çok 6. */
export function socialUrls(text) {
  const all = (String(text || "").match(SOCIAL_URL) || []).map((u) => u.replace(/[.,;:!?]+$/, ""));
  return [...new Set(all)].filter((u) => !/\/(search|tag|hashtag|explore|discover|i\/flow)\b/i.test(u) && /\/(video|status|reel|p|shorts|comments|\d{3,})/i.test(u)).slice(0, 6);
}

export async function searchSocial(query, { textLlm = callText, settings = {}, usage, logFn = () => {} } = {}) {
  try {
    const out = await textLlm({
      system: "You find public eyewitness videos for a news documentary. Reply only with direct video post URLs, one per line.",
      user: `Find public eyewitness video posts of: ${query}. Search TikTok, X (Twitter), Instagram, Telegram and Reddit. Up to 5 direct post URLs, the most-viewed real footage first. No TV channel or news-agency accounts, no compilations.`,
      webSearch: true, maxSearches: 3, maxTokens: 1500, usage, logFn, model: settings.docuFastModel || "claude-sonnet-5-5",
    });
    return socialUrls(out);
  } catch (e) {
    // Kredi/anahtar/bağlantı yoksa "gönderi yok" kaydedilmez (planSourceMoments gibi): adım durur.
    const gone = notDecided(e);
    if (gone) {
      logFn(`Sosyal medya araması durdu (${gone}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`);
      throw e;
    }
    logFn(`Sosyal medya araması yapılamadı (${String(e?.message || e).slice(0, 120)})`);
    return [];
  }
}

/* ---------------------------------------------------------------- indirme */

/** `ffmpeg -i` çıktısı → süre, boyut, kare hızı (yazmıyorsa 0), ses var mı. */
export function parseProbe(t) {
  t = String(t || "");
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(t);
  const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(t);
  const f = /Video:[^\n]*?, ([\d.]+) fps\b/.exec(t);
  return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w: v ? +v[1] : 0, h: v ? +v[2] : 0, fps: f ? +f[1] : 0, audio: /Audio:/.test(t) };
}

function probe(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
  // Zaman aşımında yarım çıktı ölçü sayılmaz: süre/boyut 0, klip alınmaz.
  if (r.error) return parseProbe("");
  return parseProbe(r.stderr || "");
}

/** Yalnızca pencere indirilir (720p'ye kadar), ardından poster karesi ve (ses anı için) ses WAV'ı çıkarılır. */
export function fetchClip({ id, win, outDir, rel, ytdlp, ffmpeg, voice = false }) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = `src-${sha(`${id}|${win.start}|${win.end}`)}`;
  const mp4 = path.join(outDir, `${base}.mp4`);
  if (!fs.existsSync(mp4)) {
    const r = ytdlp(["-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4", ...(path.isAbsolute(ffmpeg) ? ["--ffmpeg-location", path.dirname(ffmpeg)] : []), "--download-sections", `*${win.start}-${win.end}`, "--force-keyframes-at-cuts", "-o", mp4, "--", id], { timeoutMs: 240000 });
    if (r.status !== 0 || !fs.existsSync(mp4)) return null;
  }
  const p = probe(ffmpeg, mp4);
  if (!p.dur || !p.w) return null;
  const jpg = path.join(outDir, `${base}.jpg`);
  // Yarıda öldürülen ffmpeg'in kesik dosyası kalmaz: poster/ses olmaz, sonraki çalıştırmada da "var" sayılmaz.
  if (!fs.existsSync(jpg)) {
    const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-v", "error", "-ss", String(Math.min(1, p.dur / 2)), "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg], { windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
    if (r.error) fs.rmSync(jpg, { force: true });
  }
  let wav = null;
  // Ses anı: kişinin sesi; olay anı: klibin kendi sesi (doğal ses, anlatımın altında — produce.mjs natSound).
  if (p.audio) {
    wav = path.join(outDir, `${base}.wav`);
    if (!fs.existsSync(wav)) {
      const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-v", "error", "-i", mp4, "-vn", "-ac", "1", "-ar", "48000", wav], { windowsHide: true, timeout: 180000, killSignal: "SIGKILL" });
      if (r.error) fs.rmSync(wav, { force: true });
    }
    if (!fs.existsSync(wav)) wav = null;
  }
  return { video: `${rel}/${base}.mp4`, image: fs.existsSync(jpg) ? `${rel}/${base}.jpg` : null, wav: wav ? `${rel}/${base}.wav` : null, jpgAbs: jpg, dur: +p.dur.toFixed(2), w: p.w, h: p.h, ...(p.fps ? { fps: p.fps } : {}) };
}

/* ------------------------------------------------------------------ denetim */

// NewsX (Hürmüz denemesi, 20 Ekim 2026): klip aslında Reuters görüntüsüydü — köşede "Source: Reuters", ortada dev gömülü
// başlık. Ajans etiketi (Content ID riski) ve büyük gömülü yazı (bizim yazılarımızla çakışır) reddedilir.
// graphic (1.16.21, reklam güvenliği — kanal sahibi onayı): kan, yaralı/ölü insan, dövülen biri, birine ateş edilen silah.
// why kısa (Kartal Yuvası / Fransa, 24 Ekim 2026: 300 token sınırına takılan yanıtlar her seferinde ikinci, ücretli bir
// istek açtı — iki işte 13 kez). maxLength YOK: why yalnızca log'a kısaltılarak yazılır; kodda doğrulanan bir sınır uzun
// gerekçeyi "metin çok uzun" diye aynı ücretli tekrara sokardı.
// ELEME NEDENİ (Kartal Yuvası 20261024-950730, 24 Ekim / Lula 20261026-29db03, 26 Ekim 2026): her ret "anlatıma uymuyor
// ya da reklama uygun değil" diye tek satırdı; yangın videolarının ve Lula'nın miting klibinin NEDEN atıldığı bilinemedi.
// Model şimdi yazının karede kapladığı payı (textCover, %) da verir: küçük köşe logosu, filigran, isim kartı ve tek
// satır altyazı klibi düşürmez (onlar görünür kalır — kaynağın etiketi ASLA kesilmez, bulanıklaştırılmaz, kapatılmaz),
// yalnızca karenin büyük kısmını kaplayan başlık bantları düşürür. otherYear ve aiMade ayrı bayrak: farklı yılın
// görüntüsü ve yapay zekâ "haber" videosu (Kartal'da reddedilen bir yangın videosunun "Freitagabend: Alarm am
// Obersalzberg!" itfaiye karesi, Lula'da REAL NEWS HUB'ın kongre karesi) aynı videonun başka anında da aynıdır; yazı
// kuralı gevşeyince bunlar "gerçek görüntü" diye girmesin. textCover ve aiMade ZORUNLU (inceleme, 27 Ekim 2026): isteğe
// bağlıyken kısıtlı çözümlemede model aiMade'i atlayabiliyordu, atlanan alan "AI değil" okunuyordu. otherYear isteğe
// bağlı (yıl yoksa anlamsız). Alanı yazmayan eski kayıt/yanıt yine eski beş bayrakla değerlendirilir (textCover yoksa
// bigBakedText).
const LOOK_SCHEMA = { type: "object", properties: { fits: { type: "boolean" }, anchorOrStudio: { type: "boolean" }, agencyLabel: { type: "boolean" }, bigBakedText: { type: "boolean" }, graphic: { type: "boolean" }, textCover: { type: "number", description: "percent of the picture covered by burned-in text, 0-100" }, otherYear: { type: "boolean" }, aiMade: { type: "boolean" }, reenactment: { type: "boolean" }, why: { type: "string", description: "one short sentence, under 20 words" } }, required: ["fits", "anchorOrStudio", "agencyLabel", "bigBakedText", "graphic", "textCover", "aiMade", "reenactment", "why"], additionalProperties: false };
/** Gömülü yazının karede kapladığı pay (%) bu ve üstüyse "büyük ekran yazısı": bizim yazılarımızla çakışır. */
export const LOOK_TEXT_MAX = 15;
/**
 * Bir an için görme denetimi sınırları: arama adayı (eskiden 3), aynı videonun penceresi (ilk + 2) ve anın toplam
 * kare denetimi. Haber videosunda en çok 14 olay anı × 8 + 2 ses anı × 5 (tek pencere) = 122 YouTube karesi (eskiden
 * 16 × 3 = 48; sosyal medya değişmedi): en kötü durumda ~75 kare denetimi DAHA. Süre (inceleme, 27 Ekim 2026): Lula
 * 20261026-29db03'te ~22 kare denetimi bilgi çağrısı ve indirmeyle 14 dk sürdü (~35 sn/kare) — haber videosu başına en
 * kötü durumda ~30-40 dk daha (görme ücreti ~0,2 $); her yt-dlp/ffmpeg çağrısı ana süreci de kısa süre bekletir.
 */
export const LOOK_LIMITS = { candidates: 5, windows: 3, perMoment: 8 };
/**
 * Klibe değil hesaba ait hata (nedeni ya da ""): sonraki her denetim de aynı hatayla düşer. Geçersiz anahtar (HTTP 401,
 * anahtar değişince) ve fiyatı girilmemiş model ("Bütçe denetlenemiyor", 20261006-aafc1b) da ayar düzelince geçer.
 */
const accountGone = (e) => {
  const m = String(e?.message || e);
  return /anahtarı eksik/i.test(m) ? "API anahtarı yok" : e?.status === 401 ? "API anahtarı geçersiz" : /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(m) ? "Anthropic kredisi yok" : /model bütçesi doldu/i.test(m) ? "işin model bütçesi doldu" : /bütçe denetlenemiyor/i.test(m) ? "model fiyatı eksik" : "";
};
/**
 * Adım karar vermeden mi düştü (nedeni ya da ""): hesap (anahtar/kredi/bütçe), llm.js'nin denemelerinden sonra da kopan
 * bağlantı ya da yoğun servis. Böyle biten çalıştırma docu-source-clips.json yazmaz: "an yok" / "klip yok" kaydedilseydi
 * kredi ya da bağlantı gelince o anlatım bir daha aranmazdı. Planın, aramanın ya da karenin kendisine ait hata (şema,
 * ret, okunamayan resim) bir sonuçtur, eskisi gibi kaydedilir.
 */
const notDecided = (e) => accountGone(e) || (isTransientNet(e) || e?.status === 429 || e?.status >= 500 || /^Connection error|timed out/i.test(String(e?.message || "")) ? "bağlantı koptu ya da servis yoğun" : "");
const LOOK_TAIL = [
  " graphic=true if it shows blood, an injured or dead person, someone being beaten or a weapon fired at a person (tension, crowds, fire, police lines and damage are fine).",
  'agencyLabel=true only for a news-agency source credit ("Source: Reuters", AP, AFP, Getty, Storyful); a TV channel\'s own corner logo or watermark is not an agency label.',
  "textCover = percent of the picture hidden under burned-in text: headline bands, tickers, captions and their boxes. For scale: a corner logo or watermark counts 0, a one-line subtitle or a small name strap (lower third) about 3-8, a full-width two-line headline band with a ticker about 20, a title card 50 or more.",
  `bigBakedText=true only if textCover is ${LOOK_TEXT_MAX} or more. Corner logos, watermarks, small name straps and one-line subtitles are fine: they stay visible, we never crop or cover them.`,
  // aiMade "emin olduğunda" DEĞİL (inceleme, 27 Ekim 2026): Kartal'ın yapay itfaiye karesi (src-49249acdf1.jpg: ışıl ışıl
  // itfaiye kuyruğu, dağda alev, tek satır altyazı) sahne 16'nın satırına ("Crews heading up the mountain… could already
  // see the flames") birebir uyuyor; altyazısı artık ~%5 sayıldığı için onu eskiden düşüren yazı kuralı yok. "Yalnızca
  // eminsen" ve "sinematik görüntü AI değildir" istisnası onu gerçek olay görüntüsü diye ("Video: kanal · Oct 2026")
  // geçirirdi. Kaçan yapay kare gerçek olayın sahte görüntüsüdür (yayın riski); yanlış alarm yalnızca bir klip eksiltir.
  "aiMade=true if the picture looks AI-generated or computer-rendered rather than filmed by a real camera: a 3D/animated reconstruction, glossy too-perfect cinematic lighting, waxy faces, melted or garbled details, gibberish signs. Ordinary phone, CCTV, TV or drone camera footage is not aiMade, even when color-graded.",
  // Gimli 20261028-9ff721 (28 Ekim 2026): kanca klibi Mayday canlandırmasının yeniden yüklemesiydi, karede o programın
  // portreli isim kartı vardı; görme denetimi "fits" dedi, çünkü oyuncu kokpiti anlatıma uyuyordu.
  "reenactment=true if it is a staged dramatization acted out for a TV documentary series (actors playing the crew or witnesses, a rebuilt set, the polished lighting of a docudrama like Mayday or Air Crash Investigation), or if it carries another programme's own edited graphics: a name strap with a portrait inset, a programme title or chapter card. Real footage of the event, news film, home video and interviews with the real people are not reenactment.",
].join(" ");

/** Görme bayrakları → Türkçe ret nedenleri. Sıra: aynı videonun başka anında da geçerli olanlar önce. */
const HARD_REASONS = [["graphic", "sert görüntü (reklama uygun değil)"], ["agencyLabel", "ajans etiketi"], ["aiMade", "yapay zekâ görüntüsü"], ["reenactment", "canlandırma (TV belgesel dizisi)"], ["otherYear", "farklı yıl"]];

/**
 * Görme denetiminin kararı ve NEDENİ: { ok, reason, retry, why }. reason Türkçe, log için ("stüdyo spikeri, büyük ekran
 * yazısı (%30)"); retry = yalnızca bu kareye ait bir ret (stüdyo spikeri, büyük yazı, anlatıma uymuyor) — aynı videonun
 * başka anı uyabilir. Sert görüntü, ajans etiketi, yapay zekâ görüntüsü ve farklı yıl videonun kendisinindir: retry yok.
 * Hesap/bağlantı hatası (notDecided) eskisi gibi yukarı atılır.
 */
export async function lookVerdict({ jpgAbs, say, kind, who, year = 0 }, { visionLlm, settings = {}, usage, logFn = () => {} } = {}) {
  if (!visionLlm) return { ok: true, reason: "", retry: false, why: "" };
  // Poster karesi çıkmadıysa bakılacak kare yok: klip denetlenmeden girmez (sahnede eski fotoğraf poster olarak kalırdı).
  if (!jpgAbs || !fs.existsSync(jpgAbs)) {
    logFn("Kaynak video denetlenemedi, alınmadı (poster karesi çıkarılamadı)");
    return { ok: false, reason: "denetlenemedi", retry: false, why: "" };
  }
  try {
    const res = await visionLlm({
      system: "You check documentary footage. Return only the requested JSON.",
      user: kind === "voice"
        ? `Does this frame show ${who || "the person"} speaking (an interview, statement or their own video)? fits=true only if a person is clearly speaking to camera or at a podium. anchorOrStudio=true if it is a TV news anchor in a studio instead.${LOOK_TAIL}`
        : `Narration line: "${String(say).replace(/\[[^\]]*\]/g, "").trim()}". Does this frame plausibly show what the line describes (the real event, place or object)? A TV anchor in a studio, a title card, a thumbnail collage or unrelated footage = fits false. anchorOrStudio=true for a studio anchor/presenter.${year > 0 ? ` The event is from ${year}: banners, dates, posters or labels from another year = fits false and otherYear true.` : ""}${LOOK_TAIL}`,
      schema: LOOK_SCHEMA,
      images: [{ etiket: "frame", data: fs.readFileSync(jpgAbs).toString("base64"), mediaType: "image/jpeg" }],
      model: settings.visionModel || "claude-haiku-5-5",
      maxTokens: 800,
      usage,
      logFn,
    });
    // Yazının payı yazılmışsa karar odur (bigBakedText "büyük" sözcüğünü geniş yorumluyordu); yazılmamışsa eski bayrak.
    // 0-1 arası değer: model büyük yazı dediyse (bigBakedText) oran olarak yazılmış paydır (0.3 → %30); demediyse yüzde
    // birin altıdır (inceleme, 27 Ekim 2026: 0.5 = minik bir zaman damgası/filigran %50 sayılır, her penceresinde
    // olduğu için bütün video düşerdi — bu düzeltmenin önlemek istediği kusur).
    const raw = res?.textCover == null || res.textCover === "" ? NaN : Number(res.textCover);
    const cover = Number.isFinite(raw) ? Math.round(Math.min(100, Math.max(0, raw > 0 && raw < 1 && res?.bigBakedText ? raw * 100 : raw))) : null;
    const bigText = cover != null ? cover >= LOOK_TEXT_MAX : !!res?.bigBakedText;
    const hard = HARD_REASONS.filter(([k]) => !!res?.[k] && (k !== "otherYear" || year > 0)).map(([, t]) => t);
    const soft = [res?.anchorOrStudio ? "stüdyo spikeri" : "", bigText ? `büyük ekran yazısı${cover != null ? ` (%${cover})` : ""}` : "", !res?.fits ? (kind === "voice" ? "kişi konuşurken görünmüyor" : "anlatıma uymuyor") : ""].filter(Boolean);
    const why = String(res?.why || "").replace(/\s+/g, " ").trim().slice(0, 90);
    if (!hard.length && !soft.length) return { ok: true, reason: "", retry: false, why };
    return { ok: false, reason: [...hard, ...soft].join(", "), retry: !hard.length, why };
  } catch (e) {
    // Anahtar/kredi/bütçe ya da bağlantı yoksa suç klibin değil, sonraki her denetim de düşer: adım durur (docu.js
    // "Kaynak video atlandı"), docu-source-clips.json yazılmaz. Her aday tek tek reddedilseydi "klip yok" kaydedilir,
    // kredi gelince de yeniden aranmazdı.
    const gone = notDecided(e);
    if (gone) {
      logFn(`Kaynak video denetimi durdu (${gone}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`);
      throw e;
    }
    // Denetlenemeyen klip alınmaz: kancaya bakılmamış görüntü girmesin (sahne kendi görselinde kalır).
    logFn(`Kaynak video denetlenemedi, alınmadı (${String(e?.message || e).slice(0, 80)})`);
    return { ok: false, reason: "denetlenemedi", retry: false, why: "" };
  }
}

/** Eski sözleşme (boolean): klip alınır mı. onVerdict verilirse kararın nedeni de ona gelir. */
export async function looksRight(frame, opts = {}) {
  const v = await lookVerdict(frame, opts);
  opts.onVerdict?.(v);
  return v.ok;
}

/* ------------------------------------------------------------------ ana adım */

/** Olay klibinin istenen uzunluğu: satırın süresi, 3-8 sn. */
const wantSec = (s) => Math.min(SOURCE_LIMITS.maxClipSec, Math.max(SOURCE_LIMITS.minClipSec, Number(s?.voiceDur || s?.dur) || 6));
/**
 * Plan `span` verdiyse: satır + onu sürdüreceği satırlar (yapı kurallarıyla, footageHold), en çok HOLD_LIMITS.maxSec
 * (kancada hookMaxSec). Yoksa satırın kendi süresi (wantSec).
 */
export function wantFor(scenes, m) {
  const s = scenes?.[m?.scene];
  const own = wantSec(s);
  if (!s || m.kind === "voice" || !(m.span > 0)) return own;
  let t = 0;
  for (let k = 0; k < m.scene; k++) t += Number(scenes[k]?.dur) || 0;
  const r = footageHold(scenes, m.scene, { span: m.span, startSec: t });
  return r.lines.length ? Math.max(own, Math.min(HOLD_LIMITS.maxSec, Math.ceil(r.sec + 1))) : own;
}
/** Bir klibin `t` saniyesindeki karesi (uzun klibin sonunu denetlemek için). */
function frameAt(ffmpeg, mp4, t, jpg) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-v", "error", "-ss", String(Math.max(0, t)), "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg], { windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
  return !r.error && r.status === 0 && fs.existsSync(jpg) ? jpg : null;
}
/** Bu uzunluktan uzun klibin ikinci karesine de bakılır: 30 sn'lik pencere stüdyoya ya da başka bir yere kesebilir. */
export const LONG_CLIP_CHECK_SEC = 12;

/**
 * Senaryoya kaynak klipleri yerleştirir. Kayıtlı sonuç (docu-source-clips.json, anahtar = anlatım) varsa yeniden
 * arama/indirme/ödeme yapmaz. Dönüş: { script, credits, added: [{scene, kind, label}] }. Plan, sosyal medya araması ya da
 * görme denetimi hesap/bağlantı yüzünden düşerse (notDecided) hata yukarı gider ve kayıt yazılmaz.
 * rejected: ön izleme / render sonrası denetim / dönem denetiminin reddettiği adresler (docu-qa-fixes.json,
 * docu-era-fixes.json). Kartal Yuvası (25 Ekim 2026): kapı kanca klibini 4 tur reddetti, kayıttan her turda geri kondu.
 */
export async function attachSourceClips(script, { dir, publicDir, buildPrefix, credits = {}, settings = {}, usage, logFn = () => {}, llm = callJSON, visionLlm = callVisionJSON, textLlm = callText, ytdlp = null, ffmpeg = "ffmpeg", isCancelled = () => false, news = false, rejected = [] } = {}) {
  if (settings.docuSourceClips === false || !script?.scenes?.length) return { script, credits, added: [] };
  const key = sha([news ? "news" : "", ...(script.scenes || []).map((s) => s.say || "")].join("|"));
  const cacheFile = path.join(dir, "docu-source-clips.json");
  const cache = readJson(cacheFile, null);
  let picks = cache?.key === key ? cache.picks : null;
  const run = ytdlp || defaultYtdlp(settings);
  const rel = `${buildPrefix}/src`;
  const outDir = path.join(publicDir, rel);

  if (!picks) {
    // yt-dlp yoksa hiç başlamaz (ücretli plan çağrısı boşa gitmesin).
    if (!ytdlp && run(["--version"], { timeoutMs: 20000 }).status !== 0) {
      logFn("Kaynak video atlandı: yt-dlp bulunamadı (data/tools/yt-dlp.exe ya da ayar ytdlpPath)");
      return { script, credits, added: [] };
    }
    const totalSec = script.scenes.reduce((n, s) => n + (Number(s.dur) || 4), 0);
    let moments = await planSourceMoments(script, { llm, settings, usage, logFn, news });
    for (const m of moments) m.want = wantFor(script.scenes, m);
    moments = withinShare(moments, totalSec, 6, { news });
    logFn(`Kaynak video: ${moments.length} an aranıyor (${moments.filter((m) => m.kind === "voice").length} kişinin kendi sesi${moments.some((m) => m.hook) ? ", kanca klibi dahil" : ""})`);
    picks = [];
    let social = 0;
    const ret = rejectedKeys(rejected);
    fs.mkdirSync(outDir, { recursive: true });
    // Kare denetimi kararı nedeniyle (lookVerdict); looksRight'ın kendisi üzerinden: hesap/bağlantı hatası try'a girmeden
    // yukarı gider, kayıt yazılmaz (test/kaynak-klip-kunye-kare-hizi akış denetimi).
    const look = async (frame) => {
      let verdict = { ok: false, reason: "denetlenemedi", retry: false, why: "" };
      await looksRight(frame, { visionLlm, settings, usage, logFn, onVerdict: (v) => { verdict = v; } });
      return verdict;
    };
    // Uzun tutulacak klip (plan `span`): sonuna yakın kare de satıra uymalı; uymazsa klip eskisi gibi kısa kalır.
    const winOf = (m, s) => ({ want: m.want || wantSec(s), cap: (m.want || 0) > SOURCE_LIMITS.maxClipSec ? HOLD_LIMITS.maxSec : SOURCE_LIMITS.maxClipSec });
    const lateCheck = async (clip, m, s) => {
      if (m.kind !== "event" || !(clip.dur > LONG_CLIP_CHECK_SEC)) return;
      const late = frameAt(ffmpeg, path.join(outDir, path.basename(clip.video)), clip.dur * 0.75, path.join(outDir, `${path.basename(clip.video, ".mp4")}-late.jpg`));
      const v = late ? await look({ jpgAbs: late, say: s?.say, kind: "event", year: m.year }) : { ok: false, reason: "kare alınamadı" };
      if (v.ok) return;
      clip.dur = Math.min(clip.dur, SOURCE_LIMITS.maxClipSec);
      m.span = 0;
      logFn(`Kaynak video: uzun klibin sonu satıra uymuyor (${v.reason}${v.why ? ` — "${v.why}"` : ""}), ilk ${clip.dur} sn kullanılıyor`);
    };
    for (const m of moments) {
      if (isCancelled()) throw new Error("cancelled");
      const s = script.scenes[m.scene];
      const before = picks.length;
      const found = rankSearch(searchYouTube(m.query, { ytdlp: run }), m.query, { broadcast: settings.docuSourceClipsBroadcast === true }).filter((c) => !ret.has(clipKey(`https://www.youtube.com/watch?v=${c.id}`))).slice(0, LOOK_LIMITS.candidates);
      // Anın kare denetimi bütçesi (LOOK_LIMITS.perMoment): aynı videonun başka anına ancak kalan her adaya birer bakış
      // payı kalıyorsa bakılır — önce sıradaki adaylar.
      let looks = 0;
      for (const [ci, c] of found.entries()) {
        if (looks >= LOOK_LIMITS.perMoment) break;
        const info = videoInfo(c.id, { ytdlp: run });
        if (!info) continue;
        if (predatesEvent(info.upload_date, m.year)) {
          logFn(`Kaynak video atlandı (yükleme ${info.upload_date}, olay ${m.year}): "${c.title.slice(0, 60)}"`);
          continue;
        }
        let wins = [];
        let quoteText = "";
        if (m.kind === "voice") {
          const url = (info.subtitles?.en || info.automatic_captions?.en || []).find((x) => x.ext === "json3")?.url;
          if (!url) continue;
          const sub = run(["--skip-download", "--write-auto-subs", "--write-subs", "--sub-langs", "en.*,en", "--sub-format", "json3", "-o", path.join(outDir, `sub-${c.id}`), "--", c.id], { timeoutMs: 90000 });
          const subFile = sub.status === 0 ? fs.readdirSync(outDir).find((f) => f.startsWith(`sub-${c.id}`) && f.endsWith(".json3")) : null;
          if (!subFile) continue;
          const v = voiceWindow(parseJson3(JSON.parse(fs.readFileSync(path.join(outDir, subFile), "utf8"))), m.quote);
          if (!v) continue;
          // Ses anının tek penceresi var: söz altyazıda orada geçiyor.
          wins = [{ start: v.start, end: v.end }];
          quoteText = v.text;
        } else {
          wins = eventWindows(info, { ...winOf(m, s), n: LOOK_LIMITS.windows });
        }
        let got = null;
        for (const [wi, win] of wins.entries()) {
          if (wi > 0 && isCancelled()) throw new Error("cancelled");
          const clip = fetchClip({ id: c.id, win, outDir, rel, ytdlp: run, ffmpeg, voice: m.kind === "voice" });
          // İnmeyen, küçük ya da takılan video: öteki anı da öyle (erişim, boyut ve kare hızı videonun kendisinin).
          if (!clip || (m.kind === "voice" && !clip.wav)) break;
          const weak = m.kind === "event" ? clipVeto(s, clip) : "";
          if (weak) {
            logFn(`Kaynak video atlandı (${weak}): "${c.title.slice(0, 60)}"`);
            break;
          }
          looks++;
          const v = await look({ jpgAbs: clip.jpgAbs, say: s?.say, kind: m.kind, who: m.who, year: m.year });
          if (v.ok) {
            if (wi > 0) logFn(`Kaynak video: aynı videonun ${wi + 1}. anı uydu [${Math.round(win.start)}. sn]: "${c.title.slice(0, 60)}"`);
            await lateCheck(clip, m, s);
            got = clip;
            break;
          }
          const again = v.retry && wi + 1 < wins.length && looks + (found.length - ci - 1) < LOOK_LIMITS.perMoment;
          logFn(`Kaynak video reddedildi (${v.reason}${v.why ? ` — "${v.why}"` : ""}) [${Math.round(win.start)}. sn]${again ? ", aynı videonun başka anına bakılıyor" : ""}: "${c.title.slice(0, 60)}"`);
          if (!again) break;
        }
        if (!got) continue;
        const { jpgAbs, ...keep } = got;
        picks.push({ ...m, ...keep, quoteText, id: c.id, title: c.title, channel: c.channel, url: `https://www.youtube.com/watch?v=${c.id}`, uploadDate: info.upload_date || "", label: sourceLabel({ channel: c.channel, uploadDate: info.upload_date, who: m.kind === "voice" ? m.who : "" }) });
        break;
      }
      // YouTube'da yoksa: TikTok / X / Instagram / Telegram gönderisi (web aramasıyla bulunur, yalnızca pencere indirilir).
      if (picks.length === before && m.kind === "event" && social < SOCIAL_MAX && settings.docuSourceSocial !== false) {
        social++;
        // Ne bulunduğu ve neden alınmadığı log'a yazılır (Kartal Yuvası, 24 Ekim 2026: 15 arama yapıldı, iz kalmadı).
        const urls = await searchSocial(m.query, { textLlm, settings, usage, logFn });
        logFn(`Sosyal medya: "${m.query.slice(0, 50)}" için ${urls.length} gönderi bulundu`);
        for (const url of urls) {
          if (isCancelled()) throw new Error("cancelled");
          if (ret.has(clipKey(url))) { logFn(`  sosyal medya atlandı (reddedilmiş): ${url.slice(0, 70)}`); continue; }
          const info = videoInfo(url, { ytdlp: run });
          const who = String(info?.uploader || info?.channel || info?.uploader_id || "").trim();
          const skip = !info ? "indirilemiyor (giriş/erişim)" : !(Number(info.duration) >= SOURCE_LIMITS.minClipSec) ? "çok kısa" : !settings.docuSourceClipsBroadcast && BROADCASTERS.test(who) ? `TV/ajans hesabı (${who})` : DRAMATIZED.test(`${who} ${info.title || ""}`) ? `canlandırma dizisi (${who})` : info.webpage_url && ret.has(clipKey(info.webpage_url)) ? "reddedilmiş" : predatesEvent(info.upload_date, m.year) ? `yükleme ${info.upload_date}, olay ${m.year}` : "";
          if (skip) { logFn(`  sosyal medya atlandı (${skip}): ${url.slice(0, 70)}`); continue; }
          const win = eventWindow(info, winOf(m, s));
          if (!win) continue;
          const clip = fetchClip({ id: url, win, outDir, rel, ytdlp: run, ffmpeg });
          if (!clip) { logFn(`  sosyal medya indirilemedi: ${url.slice(0, 70)}`); continue; }
          const weak = clipVeto(s, clip);
          if (weak) { logFn(`  sosyal medya atlandı (${weak}): ${url.slice(0, 70)}`); continue; }
          // Gönderi başına tek pencere (kısa tanık videosu; sosyal medya bütçesi değişmedi), ama ret nedeni yazılır.
          const v = await look({ jpgAbs: clip.jpgAbs, say: s?.say, kind: "event", year: m.year });
          if (!v.ok) {
            logFn(`Sosyal medya klibi reddedildi (${v.reason}${v.why ? ` — "${v.why}"` : ""}): ${url.slice(0, 70)}`);
            continue;
          }
          await lateCheck(clip, m, s);
          const { jpgAbs, ...keep } = clip;
          const site = /tiktok/i.test(url) ? "TikTok" : /instagram/i.test(url) ? "Instagram" : /t\.me/i.test(url) ? "Telegram" : /reddit/i.test(url) ? "Reddit" : /youtube/i.test(url) ? "YouTube" : "X";
          const handle = who ? `${who.startsWith("@") || site === "Reddit" ? who : `@${who}`} on ${site}` : site;
          picks.push({ ...m, ...keep, quoteText: "", id: sha(url), title: String(info.title || info.description || "").slice(0, 120), channel: handle, url: info.webpage_url || url, uploadDate: info.upload_date || "", label: sourceLabel({ channel: handle, uploadDate: info.upload_date }) });
          break;
        }
      }
    }
    writeJson(cacheFile, { key, at: new Date().toISOString(), picks });
  }
  // Klibin kendi sesi yalnızca açıkça istenirse (docuNatSound: true). Kanal sahibi (25 Ekim 2026): "videoları
  // gösterirken arada yine konuşuyor". Fransa'da Merkel–Sarkozy basın toplantısının ve Le Parisien muhabirinin sesi
  // anlatıcının altında konuştu; drone kliplerinde başkasının müziği vardı (Content ID riski). Konuşma/müzik ile
  // gerçek ortam sesini ayıran güvenilir bir ölçü yok (spektral düzlük ayırmadı), atmosferi ortam sesi kütüphanesi
  // veriyor. Kişinin kendi sesi (kind "voice") ayrı sahnedir, anlatım o sırada susar — ona dokunulmaz.
  // Klibin afişi (yoksa ilk karesi) diskte ölçülür: siyah-beyaz arşiv filmi scene.monoSource alır (Gimli 9ff721
  // önce/sonra, 29 Ekim 2026). Yeniden indirme yok; ölçülemezse bayrak konmaz (renkli sayılır).
  const mono = (p) => isMonochrome(measureSaturation(path.join(publicDir, p.image || p.video || ""), { ffmpeg }));
  return applySourcePicks(script, credits, picks, { logFn, natural: settings.docuNatSound === true, rejected, mono });
}

/**
 * Yerine geçilen durağan görselin kendisine ait alanları: fotoğrafın yazısı/künyesi klibin üstünde onu yanlış adlandırır
 * (motorun ödünç geçişi de siler: produce.mjs), boyut ve odak noktası klibin karesine ait değil. `annotate` (dondur ve
 * işaretle): placeAnnotations bu adımdan ÖNCE çalışır, x/y/r ESKİ fotoğrafın içindedir; klipte işaret boş yere düşerdi
 * ve klip sahnesinde yeniden yerleştirilmez (placeAnnotations klip sahnesinin işaretini zaten kaldırır).
 * Gerisi bu adımda henüz yok ya da klipte işlemez: kırpımı ve derinlik katmanını motor yazar (klip sahnesine katman ve
 * açılış hareketi yapılmaz), kamera gerçek görüntüyü oynatmaz (steadyFootage), sığdırma ve sunum klibin kendi boyutuyla
 * seçilir (variety.js resolveFit, scenes.tsx objectOnly).
 */
const STILL_FIELDS = ["caption", "credit", "imgW", "imgH", "focus", "annotate"];

/** Kayıtlı seçimleri senaryoya uygular (saf; testler doğrudan çağırır). Ses klipleri satırın ARDINA eklenir. */
export function applySourcePicks(script, credits, picks, { logFn = () => {}, natural = true, rejected = [], mono = () => false } = {}) {
  const scenes = script.scenes.map((s) => ({ ...s }));
  const added = [];
  // Künye kaydı: klibin sahibi kanalıdır; lisans İngilizce (açıklama İngilizce) ve "by" sözcüğü geçmez — kunye.js
  // ATIF_ISTER (/\bBY\b/) onu CC BY sanardı. Sosyal medya kliplerine de "YouTube" yazılıyordu (Kartal Yuvası, Fransa).
  const credit = (p) => ({ provider: /youtube.com|youtu.be/i.test(p.url || "") ? "youtube" : "social", eser: p.title, kanal: p.channel, sahip: p.channel, url: p.url, sayfa: p.url, file: p.video, type: "video", lisans: "Short excerpt for commentary, source credited" });
  // Reddedilen klip kayıttan yeniden konmaz; sahne kendi görselinde (arşiv fotoğrafı ya da AI istemi) kalır.
  const ret = rejectedKeys(rejected);
  /** Siyah-beyaz kaynak mı (ölçüm hatası → hayır: bayrak konmaz). */
  const monoClip = (p) => { try { return mono(p) === true; } catch { return false; } };
  const usable = (picks || []).filter((p) => {
    if (!pickRejected(p, ret)) return true;
    logFn(`Kaynak video: sahne ${p.scene + 1} reddedilmiş klip atlandı — ${p.label}`);
    return false;
  });
  for (const p of usable.filter((x) => x.kind === "event")) {
    const s = scenes[p.scene];
    if (!s) continue;
    // İsim kartı sahnesi plana hiç girmez (sourceCandidates); eski kayıttan gelse de kişinin tek kartı silinmez.
    const veto = s.name ? "isim kartı sahnesi" : predatesEvent(p.uploadDate, p.year) ? `yükleme ${p.uploadDate}, olay ${p.year}` : clipVeto(s, p);
    if (veto) { logFn(`Kaynak video: sahne ${p.scene + 1} klibi alınmadı (${veto}) — ${p.label}`); continue; }
    for (const k of STILL_FIELDS) delete s[k];
    // Yerine geçilen fotoğrafın siyah-beyaz bayrağı klibe geçmez: klibin kendi ölçümü (mono(p)) karar verir.
    delete s.monoSource;
    // Klibin kendi sesi (kalabalık, siren) anlatımın altında: produce.mjs natSound.
    // `holdSpan`: planın "bu görüntü ardındaki N satıra da uyuyor" kararı — footage-hold.js o satırları klibe bağlar.
    Object.assign(s, { video: p.video, videoStart: 0, videoDur: p.dur, videoW: p.w, videoH: p.h, sourceLabel: p.label, archived: true, ...(p.image ? { image: p.image, imgW: p.w, imgH: p.h } : {}), ...(p.wav && natural ? { natSound: { file: p.wav, dur: p.dur } } : {}), ...(p.span > 0 ? { holdSpan: p.span } : {}) });
    delete s.imagePrompt;
    if (monoClip(p)) s.monoSource = true;
    credits[`scene-${p.scene}`] = credit(p);
    added.push({ scene: p.scene, kind: "event", label: p.label });
  }
  // Ses klipleri: arkadan öne eklenir ki önceki indeksler kaymasın.
  for (const p of usable.filter((x) => x.kind === "voice").sort((a, b) => b.scene - a.scene)) {
    const s = scenes[p.scene];
    if (!s || !p.wav) continue;
    const say = String(p.quoteText || p.quote).trim();
    const voice = { type: "photo", chapter: s.chapter, mood: s.mood, say, dur: p.dur, video: p.video, videoStart: 0, videoDur: p.dur, videoW: p.w, videoH: p.h, sourceLabel: p.label, sourceVoice: { file: p.wav, dur: p.dur }, archived: true, ...(p.image ? { image: p.image } : {}) };
    if (monoClip(p)) voice.monoSource = true;
    scenes.splice(p.scene + 1, 0, voice);
    added.push({ scene: p.scene + 1, kind: "voice", label: p.label });
  }
  // Ses eklemeleri künye anahtarlarını kaydırır: künyeler sahne dosyasıyla eşleştiği için (file) sorun olmaz.
  for (const p of usable.filter((x) => x.kind === "voice")) credits[`source-${p.id}`] = credit(p);
  for (const a of added) logFn(`Kaynak video: sahne ${a.scene + 1} ${a.kind === "voice" ? "kişinin kendi sesi" : "olay görüntüsü"} — ${a.label}`);
  return { script: { ...script, scenes }, credits, added };
}
